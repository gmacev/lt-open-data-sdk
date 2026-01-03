/**
 * Count command - Count records in a dataset
 */

import { SpintaClient } from '../../client/SpintaClient.js';
import { QueryBuilder } from '../../builder/QueryBuilder.js';
import { parseFilter } from '../parsers/filter.js';
import { OutputWriter } from '../utils/output.js';
import { UserError, ApiError } from '../utils/errors.js';
import { Spinner, formatNumber } from '../ui/spinner.js';
import type { Colors } from '../ui/colors.js';

export interface CountOptions {
  model: string;
  filters: string[];
  format: 'json' | 'csv' | 'ndjson';
  output?: string;
  quiet: boolean;
  baseUrl: string;
  colors: Colors;
}

export async function runCount(options: CountOptions): Promise<void> {
  const writer = new OutputWriter({ output: options.output, quiet: options.quiet });
  const spinner = new Spinner(options.colors, options.quiet);

  if (options.model === '') {
    throw new UserError('Missing model argument', 'Usage: lt-data count <model>');
  }

  spinner.start(`Counting records in ${options.model}...`);

  const client = new SpintaClient({ baseUrl: options.baseUrl });

  try {
    // Parse filters and build query
    const parsedFilters = options.filters.map(parseFilter);
    let query = new QueryBuilder();

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

    const count = await client.count(options.model, query);

    spinner.success(`Total: ${formatNumber(count)} records`);

    // Format output
    if (options.format === 'json') {
      writer.writeData(JSON.stringify({ count }, null, 2) + '\n');
    } else if (options.format === 'ndjson') {
      writer.writeDataLine(JSON.stringify({ count }));
    } else {
      writer.writeDataLine(String(count));
    }
  } catch (error) {
    spinner.fail(`Failed to count records`);
    if (error instanceof UserError || error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error instanceof Error ? error.message : String(error));
  }
}
