/**
 * Search command - Find datasets by keyword
 */

import { SpintaClient } from '../../client/SpintaClient.js';
import { OutputWriter } from '../utils/output.js';
import { UserError, ApiError } from '../utils/errors.js';
import { Spinner, formatDuration } from '../ui/spinner.js';
import type { Colors } from '../ui/colors.js';

export interface SearchOptions {
  query: string;
  namespace: string;
  limit: number;
  format: 'json' | 'csv' | 'ndjson';
  output?: string;
  quiet: boolean;
  baseUrl: string;
  colors: Colors;
}

const DEFAULT_NAMESPACE = 'datasets/gov';
const DEFAULT_LIMIT = 20;

export async function runSearch(options: SearchOptions): Promise<void> {
  const writer = new OutputWriter({ output: options.output, quiet: options.quiet });
  const spinner = new Spinner(options.colors, options.quiet);
  const namespace = options.namespace !== '' ? options.namespace : DEFAULT_NAMESPACE;
  const limit = options.limit > 0 ? options.limit : DEFAULT_LIMIT;

  if (options.query === '') {
    throw new UserError('Missing search query', 'Usage: lt-data search <keyword>');
  }

  spinner.start(`Searching for "${options.query}" in ${namespace}...`);
  const startTime = Date.now();

  const client = new SpintaClient({ baseUrl: options.baseUrl });

  try {
    // Use discoverModels to find all models, then filter by keyword
    const allModels = await client.discoverModels(namespace);

    // Filter by query (case-insensitive search in path and title)
    const queryLower = options.query.toLowerCase();
    const matches = allModels
      .filter((model) => {
        const pathMatch = model.path.toLowerCase().includes(queryLower);
        const titleMatch = model.title?.toLowerCase().includes(queryLower) ?? false;
        return pathMatch || titleMatch;
      })
      .slice(0, limit);

    const duration = (Date.now() - startTime) / 1000;
    spinner.success(`Found ${String(matches.length)} datasets in ${formatDuration(duration)}`);

    if (options.format === 'csv') {
      throw new UserError('CSV format is not supported for search', 'Use --format json or --format ndjson');
    }

    // Format output
    if (options.format === 'json') {
      writer.writeData(JSON.stringify(matches, null, 2) + '\n');
    } else {
      for (const model of matches) {
        writer.writeDataLine(`📊 ${options.colors.bold(model.path)}`);
        if (model.title !== undefined && model.title !== '') {
          writer.writeDataLine(`   ${model.title}`);
        }
        writer.writeDataLine('');
      }
    }
  } catch (error) {
    spinner.fail(`Search failed`);
    if (error instanceof UserError || error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error instanceof Error ? error.message : String(error));
  }
}
