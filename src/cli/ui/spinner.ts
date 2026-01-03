/**
 * Spinner and progress utilities for CLI
 * Hand-rolled for minimal dependencies
 */

import type { Colors } from './colors.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL = 80;

/**
 * Simple terminal spinner for progress indication
 * Only shows when stderr is a TTY
 */
export class Spinner {
  private readonly colors: Colors;
  private readonly quiet: boolean;
  private readonly isTTY: boolean;
  private message = '';
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(colors: Colors, quiet: boolean) {
    this.colors = colors;
    this.quiet = quiet;
    this.isTTY = process.stderr.isTTY;
  }

  /**
   * Start the spinner with a message
   */
  start(message: string): void {
    if (this.quiet) {
      return;
    }

    this.message = message;
    this.frameIndex = 0;

    if (this.isTTY) {
      this.render();
      this.timer = setInterval(() => {
        this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
        this.render();
      }, SPINNER_INTERVAL);
    } else {
      // Non-TTY: just print the message once
      process.stderr.write(`${message}\n`);
    }
  }

  /**
   * Update the spinner message
   */
  update(message: string): void {
    if (this.quiet) {
      return;
    }

    this.message = message;
    if (!this.isTTY) {
      process.stderr.write(`${message}\n`);
    }
  }

  /**
   * Stop spinner with success message
   */
  success(message: string): void {
    this.stop();
    if (!this.quiet) {
      process.stderr.write(`${this.colors.success('✓')} ${message}\n`);
    }
  }

  /**
   * Stop spinner with error message
   */
  fail(message: string): void {
    this.stop();
    // Errors always show, even with --quiet
    process.stderr.write(`${this.colors.error('✗')} ${message}\n`);
  }

  /**
   * Stop spinner with warning message
   */
  warn(message: string): void {
    this.stop();
    if (!this.quiet) {
      process.stderr.write(`${this.colors.warning('⚠')} ${message}\n`);
    }
  }

  /**
   * Stop the spinner without a message
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.isTTY) {
      // Clear the current line
      process.stderr.write('\r\x1b[K');
    }
  }

  private render(): void {
    const frame = this.colors.cyan(SPINNER_FRAMES[this.frameIndex] ?? '⠋');
    process.stderr.write(`\r\x1b[K${frame} ${this.message}`);
  }
}

/**
 * Format a number with thousands separators
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format a duration in seconds
 */
export function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${String(Math.round(seconds * 1000))}ms`;
  }
  return `${seconds.toFixed(1)}s`;
}
