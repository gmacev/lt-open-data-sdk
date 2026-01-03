/**
 * Describe command - Show model schema
 * Uses existing fetchModelMetadata() from crawler.ts - no wheel reinvention
 */

import { SpintaClient } from '../../client/SpintaClient.js';
import { fetchModelMetadata } from '../crawler.js';
import { OutputWriter } from '../utils/output.js';
import { UserError, ApiError } from '../utils/errors.js';
import { Spinner } from '../ui/spinner.js';
import type { Colors } from '../ui/colors.js';

export interface DescribeOptions {
  model: string;
  format: 'json' | 'csv' | 'ndjson';
  output?: string;
  quiet: boolean;
  baseUrl: string;
  colors: Colors;
}

export async function runDescribe(options: DescribeOptions): Promise<void> {
  const writer = new OutputWriter({ output: options.output, quiet: options.quiet });
  const spinner = new Spinner(options.colors, options.quiet);

  if (options.model === '') {
    throw new UserError('Missing model argument', 'Usage: lt-data describe <model>');
  }

  spinner.start(`Describing ${options.model}...`);

  const client = new SpintaClient({ baseUrl: options.baseUrl });

  try {
    const metadata = await fetchModelMetadata(client, options.model, false);

    spinner.success(`Found ${String(metadata.properties.length)} fields`);

    if (options.format === 'csv') {
      throw new UserError('CSV format is not supported for describe', 'Use --format json or --format ndjson');
    }

    // Format output
    if (options.format === 'json') {
      writer.writeData(JSON.stringify(metadata, null, 2) + '\n');
    } else {
      for (const prop of metadata.properties) {
        writer.writeDataLine(JSON.stringify(prop));
      }
    }
  } catch (error) {
    spinner.fail(`Failed to describe model`);
    if (error instanceof UserError || error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error instanceof Error ? error.message : String(error));
  }
}
