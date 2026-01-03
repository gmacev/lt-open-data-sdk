/**
 * JSON formatter for CLI
 * Outputs pretty-printed JSON array
 */

import type { OutputWriter } from '../utils/output.js';

export function formatJson(data: unknown[], writer: OutputWriter): void {
  const json = JSON.stringify(data, null, 2);
  writer.writeData(json + '\n');
}
