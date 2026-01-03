/**
 * Get command - Fetch a single record by ID
 */

import { SpintaClient } from '../../client/SpintaClient.js';
import { OutputWriter } from '../utils/output.js';
import { UserError, ApiError } from '../utils/errors.js';
import { Spinner } from '../ui/spinner.js';
import type { Colors } from '../ui/colors.js';

export interface GetOptions {
  model: string;
  id: string;
  format: 'json' | 'csv' | 'ndjson';
  output?: string;
  quiet: boolean;
  baseUrl: string;
  colors: Colors;
}

export async function runGet(options: GetOptions): Promise<void> {
  const writer = new OutputWriter({ output: options.output, quiet: options.quiet });
  const spinner = new Spinner(options.colors, options.quiet);

  if (options.model === '') {
    throw new UserError('Missing model argument', 'Usage: lt-data get <model> <id>');
  }

  if (options.id === '') {
    throw new UserError('Missing id argument', 'Usage: lt-data get <model> <id>');
  }

  spinner.start(`Fetching record ${options.id}...`);

  const client = new SpintaClient({ baseUrl: options.baseUrl });

  try {
    const record = await client.getOne(options.model, options.id);

    spinner.success(`Found record`);

    // Format output - always JSON for single record
    writer.writeData(JSON.stringify(record, null, 2) + '\n');
  } catch (error) {
    spinner.fail(`Failed to fetch record`);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('404') || message.includes('not found')) {
      throw new ApiError(`Record with ID '${options.id}' not found in ${options.model}`);
    }
    throw new ApiError(message);
  }
}
