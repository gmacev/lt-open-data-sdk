/**
 * NDJSON (Newline Delimited JSON) formatter for CLI
 * Streams one JSON object per line
 */

import type { OutputWriter } from '../utils/output.js';

/**
 * Write a single record as NDJSON line
 */
export function writeNdjsonLine(record: unknown, writer: OutputWriter): void {
  const line = JSON.stringify(record);
  writer.writeDataLine(line);
}

/**
 * Format entire array as NDJSON (for non-streaming use)
 */
export function formatNdjson(data: unknown[], writer: OutputWriter): void {
  for (const record of data) {
    writeNdjsonLine(record, writer);
  }
}
