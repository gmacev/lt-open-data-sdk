/**
 * Output utilities for CLI
 * Ensures stdout/stderr separation invariant
 */

import { writeFileSync, appendFileSync } from 'fs';

export interface OutputOptions {
  output?: string;
  quiet?: boolean;
  includeBom?: boolean;
}

/**
 * Writer that respects stdout/stderr separation
 * - Data goes to stdout (or file)
 * - Everything else goes to stderr
 */
export class OutputWriter {
  private readonly outputPath: string | null;
  private readonly quiet: boolean;
  private readonly includeBom: boolean;
  private isFirstWrite = true;

  constructor(options: OutputOptions = {}) {
    this.outputPath = options.output ?? null;
    this.quiet = options.quiet === true;
    this.includeBom = options.includeBom === true;
  }

  /**
   * Write data to stdout or file
   * This is the ONLY way data should leave the CLI
   */
  writeData(data: string): void {
    if (this.outputPath !== null) {
      if (this.isFirstWrite) {
        const content = this.includeBom ? '\uFEFF' + data : data;
        writeFileSync(this.outputPath, content, 'utf-8');
        this.isFirstWrite = false;
      } else {
        appendFileSync(this.outputPath, data, 'utf-8');
      }
    } else {
      process.stdout.write(data);
    }
  }

  /**
   * Write a line of data (adds newline)
   */
  writeDataLine(data: string): void {
    this.writeData(data + '\n');
  }

  /**
   * Log to stderr (progress, warnings, etc.)
   * Respects --quiet flag
   */
  log(message: string): void {
    if (!this.quiet) {
      process.stderr.write(message + '\n');
    }
  }

  /**
   * Log error to stderr (always, even with --quiet)
   */
  error(message: string): void {
    process.stderr.write(message + '\n');
  }

  /**
   * Check if output is a TTY (for color decisions)
   */
  isTTY(): boolean {
    if (this.outputPath !== null) {
      return false;
    }
    return process.stdout.isTTY;
  }
}
