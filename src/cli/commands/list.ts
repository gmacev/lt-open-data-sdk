/**
 * List command - Browse namespaces and models
 */

import { SpintaClient } from '../../client/SpintaClient.js';
import { OutputWriter } from '../utils/output.js';
import { ApiError, UserError } from '../utils/errors.js';
import { Spinner } from '../ui/spinner.js';
import type { Colors } from '../ui/colors.js';

export interface ListOptions {
  namespace: string;
  format: 'json' | 'csv' | 'ndjson';
  output?: string;
  quiet: boolean;
  baseUrl: string;
  colors: Colors;
}

const DEFAULT_NAMESPACE = 'datasets/gov';

export async function runList(options: ListOptions): Promise<void> {
  const writer = new OutputWriter({ output: options.output, quiet: options.quiet });
  const spinner = new Spinner(options.colors, options.quiet);
  const namespace = options.namespace !== '' ? options.namespace : DEFAULT_NAMESPACE;

  spinner.start(`Listing ${namespace}...`);

  const client = new SpintaClient({ baseUrl: options.baseUrl });

  try {
    const items = await client.listNamespace(namespace);

    spinner.success(`Found ${String(items.length)} items in ${namespace}`);

    // Format output based on requested format
    if (options.format === 'csv') {
      throw new UserError('CSV format is not supported for list', 'Use --format json or --format ndjson');
    }

    if (options.format === 'json') {
      writer.writeData(JSON.stringify(items, null, 2) + '\n');
    } else {
      for (const item of items) {
        const icon = item._type === 'ns' ? '📁' : '📊';
        const name = item._id;
        writer.writeDataLine(`${icon} ${name}`);
        const title = item.title;
        if (title !== undefined && title !== '') {
          writer.writeDataLine(`   ${options.colors.dim(title)}`);
        }
      }
    }
  } catch (error) {
    spinner.fail(`Failed to list namespace`);
    if (error instanceof UserError || error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error instanceof Error ? error.message : String(error));
  }
}
