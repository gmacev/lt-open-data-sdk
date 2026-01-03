/**
 * CSV formatter for CLI
 * Streams CSV with header row and proper escaping
 *
 * Limitations (explicit):
 * - Nested objects are flattened with dot notation
 * - Array fields cause an error (not flattened)
 * - Field order follows first record's key order
 */

import type { OutputWriter } from '../utils/output.js';
import { UserError } from '../utils/errors.js';

/**
 * Flatten a nested object into dot-notation keys
 */
function flattenObject(
  obj: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix !== '' ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      throw new UserError(
        `Field '${fullKey}' is an array. CSV format does not support arrays.`,
        'Use --format ndjson instead.'
      );
    }

    if (value !== null && typeof value === 'object') {
      const nested = flattenObject(value as Record<string, unknown>, fullKey);
      Object.assign(result, nested);
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Escape a value for CSV
 * - Strings with commas, quotes, or newlines are quoted
 * - Quotes inside are doubled
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Handle different types explicitly
  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    str = String(value);
  } else {
    // For objects and other types, use JSON
    str = JSON.stringify(value);
  }

  // Check if quoting is needed
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Double quotes and wrap
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}

/**
 * CSV writer that handles streaming
 */
export class CsvWriter {
  private headers: string[] | null = null;
  private readonly writer: OutputWriter;

  constructor(writer: OutputWriter) {
    this.writer = writer;
  }

  /**
   * Write a single record as CSV row
   * First call establishes header order
   */
  writeRow(record: Record<string, unknown>): void {
    const flattened = flattenObject(record);

    // First record establishes headers
    if (this.headers === null) {
      this.headers = Object.keys(flattened);
      this.writer.writeDataLine(this.headers.map(escapeCSV).join(','));
    }

    // Write values in header order
    const values = this.headers.map((h) => escapeCSV(flattened[h]));
    this.writer.writeDataLine(values.join(','));
  }
}

/**
 * Format entire array as CSV (for non-streaming use)
 */
export function formatCsv(data: unknown[], writer: OutputWriter): void {
  if (data.length === 0) {
    return;
  }

  const csvWriter = new CsvWriter(writer);
  for (const record of data) {
    if (typeof record !== 'object' || record === null) {
      throw new UserError(
        'CSV format requires array of objects',
        'Use --format json or --format ndjson for non-object data'
      );
    }
    csvWriter.writeRow(record as Record<string, unknown>);
  }
}
