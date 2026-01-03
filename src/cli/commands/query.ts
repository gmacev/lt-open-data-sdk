/**
 * Query command - Main data access with filtering, sorting, pagination
 */

import { SpintaClient } from '../../client/SpintaClient.js';
import { QueryBuilder } from '../../builder/QueryBuilder.js';
import { parseFilter } from '../parsers/filter.js';
import { OutputWriter } from '../utils/output.js';
import { UserError, ApiError, PartialFailureError } from '../utils/errors.js';
import { formatJson } from '../formatters/json.js';
import { formatNdjson, writeNdjsonLine } from '../formatters/ndjson.js';
import { formatCsv, CsvWriter } from '../formatters/csv.js';
import { Spinner, formatNumber, formatDuration } from '../ui/spinner.js';
import { SpintaError } from '../../client/errors.js';
import type { Colors } from '../ui/colors.js';

export interface QueryOptions {
  model: string;
  filters: string[];
  select?: string;
  sort?: string;
  limit: number;
  stream: boolean;
  format: 'json' | 'csv' | 'ndjson';
  output?: string;
  quiet: boolean;
  noRetry: boolean;
  baseUrl: string;
  colors: Colors;
}

const MAX_LIMIT = 10000;
const DEFAULT_PAGE_SIZE = 100;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const MAX_RATE_LIMIT_ATTEMPTS = 5;

export async function runQuery(options: QueryOptions): Promise<void> {
  const writer = new OutputWriter({
    output: options.output,
    quiet: options.quiet,
    includeBom: options.format === 'csv',
  });
  const spinner = new Spinner(options.colors, options.quiet);

  // Validate options
  if (options.stream && options.format === 'json') {
    throw new UserError(
      '--stream is not supported with --format json',
      'Use --format ndjson or --format csv for streaming'
    );
  }

  if (options.stream && options.select !== undefined) {
    throw new UserError(
      '--select is not supported with --stream',
      'Streaming with field projection breaks pagination tokens; remove --select or drop --stream'
    );
  }

  // Resolve effective limit
  // -1 means "default/unspecified"
  const isDefaultLimit = options.limit === -1;
  const effectiveLimit = isDefaultLimit
    ? (options.stream ? Infinity : DEFAULT_PAGE_SIZE)
    : options.limit;

  if (!options.stream && effectiveLimit > MAX_LIMIT) {
    throw new UserError(
      `--limit cannot exceed ${String(MAX_LIMIT)}`,
      'Use --stream for larger datasets'
    );
  }

  if (options.model === '') {
    throw new UserError('Missing model argument', 'Usage: lt-data query <model>');
  }

  // Parse filters and build query
  const parsedFilters = options.filters.map(parseFilter);
  let query = new QueryBuilder();

  // Apply select
  if (options.select !== undefined) {
    const fields = options.select.split(',').map((f) => f.trim());
    query = query.select(...fields);
  }

  // Apply filters using QueryBuilder
  for (const filter of parsedFilters) {
    query = query.filter((f) => {
      const field = f.field(filter.field);
      switch (filter.operator) {
        case 'eq':
          return field.eq(filter.value);
        case 'ne':
          return field.ne(filter.value);
        case 'lt':
          return field.lt(filter.value);
        case 'le':
          return field.le(filter.value);
        case 'gt':
          return field.gt(filter.value);
        case 'ge':
          return field.ge(filter.value);
        case 'contains':
          return field.contains(filter.value as string);
        case 'startswith':
          return field.startswith(filter.value as string);
        case 'endswith':
          return field.endswith(filter.value as string);
        case 'in':
          return field.in(filter.values ?? []);
        case 'notin':
          return field.notin(filter.values ?? []);
      }
    });
  }

  // Apply sort
  if (options.sort !== undefined) {
    if (options.sort.startsWith('-')) {
      query = query.sortDesc(options.sort.slice(1));
    } else {
      query = query.sort(options.sort);
    }
  }

  // Create client
  const client = new SpintaClient({ baseUrl: options.baseUrl });

  if (options.stream) {
    await runStreamingQuery(client, options.model, query, options, writer, spinner, effectiveLimit);
  } else {
    // For bounded, we must apply limit to query
    query = query.limit(effectiveLimit);
    await runBoundedQuery(client, options.model, query, options, writer, spinner);
  }
}

async function runBoundedQuery(
  client: SpintaClient,
  model: string,
  query: QueryBuilder,
  options: QueryOptions,
  writer: OutputWriter,
  spinner: Spinner
): Promise<void> {
  spinner.start(`Fetching data from ${model}...`);
  const startTime = Date.now();

  try {
    const data = await client.getAll(model, query);
    const duration = (Date.now() - startTime) / 1000;

    spinner.success(`Fetched ${formatNumber(data.length)} records in ${formatDuration(duration)}`);

    // Format output
    switch (options.format) {
      case 'json':
        formatJson(data, writer);
        break;
      case 'ndjson':
        formatNdjson(data, writer);
        break;
      case 'csv':
        formatCsv(data, writer);
        break;
    }
  } catch (error) {
    spinner.fail(`Failed to fetch data`);
    throw wrapError(error);
  }
}

async function runStreamingQuery(
  client: SpintaClient,
  model: string,
  query: QueryBuilder,
  options: QueryOptions,
  writer: OutputWriter,
  spinner: Spinner,
  limit: number
): Promise<void> {
  spinner.start(`Streaming data from ${model}...`);
  const startTime = Date.now();

  let totalRecords = 0;
  let csvWriter: CsvWriter | null = null;

  // For CSV, we need to initialize the writer on first record
  if (options.format === 'csv') {
    csvWriter = new CsvWriter(writer);
  }

  try {
    const stream = client.streamWithRetry(model, query, {
      pageSize: DEFAULT_PAGE_SIZE,
      initialBackoffMs: INITIAL_BACKOFF_MS,
      maxBackoffMs: MAX_BACKOFF_MS,
      maxAttempts: MAX_RATE_LIMIT_ATTEMPTS,
      noRetry: options.noRetry,
    });

    for await (const record of stream) {
      if (totalRecords >= limit) {
        break;
      }

      totalRecords++;

      if (options.format === 'ndjson') {
        writeNdjsonLine(record, writer);
      } else if (csvWriter !== null) {
        csvWriter.writeRow(record as Record<string, unknown>);
      }

      // Update progress every 100 records
      if (totalRecords % 100 === 0) {
        spinner.update(`Streaming data from ${model}... (${formatNumber(totalRecords)} records)`);
      }
    }

    const duration = (Date.now() - startTime) / 1000;
    spinner.success(`Streamed ${formatNumber(totalRecords)} records in ${formatDuration(duration)}`);
  } catch (error) {
    if (isRateLimitError(error)) {
      spinner.fail(`Rate limited after ${formatNumber(totalRecords)} records`);
      throw new ApiError(
        `Rate limited after ${String(totalRecords)} records fetched. Try again later or use --no-retry for fast fail.`,
        `Fetched ${String(totalRecords)} records before rate limit`
      );
    }

    // If we have fetched some records, this is a partial failure
    if (totalRecords > 0) {
      spinner.fail(`Stream interrupted after ${formatNumber(totalRecords)} records`);
      throw new PartialFailureError(
        `Stream interrupted after ${String(totalRecords)} records: ${getErrorMessage(error)}`,
        totalRecords
      );
    }

    spinner.fail(`Failed to stream data`);
    throw wrapError(error);
  }
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof SpintaError && error.status === 429;
}

function wrapError(error: unknown): Error {
  if (error instanceof UserError || error instanceof ApiError || error instanceof PartialFailureError) {
    return error;
  }
  return new ApiError(getErrorMessage(error));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
