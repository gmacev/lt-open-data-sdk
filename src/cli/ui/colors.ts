/**
 * Color utilities for CLI
 * Uses picocolors for cross-platform terminal colors
 */

import pc from 'picocolors';

export interface Colors {
  success: (text: string) => string;
  error: (text: string) => string;
  warning: (text: string) => string;
  info: (text: string) => string;
  dim: (text: string) => string;
  bold: (text: string) => string;
  cyan: (text: string) => string;
  magenta: (text: string) => string;
}

/**
 * Create color functions based on whether colors are enabled
 */
export function createColors(enabled: boolean): Colors {
  if (!enabled) {
    // No-op functions when colors are disabled
    const identity = (text: string): string => text;
    return {
      success: identity,
      error: identity,
      warning: identity,
      info: identity,
      dim: identity,
      bold: identity,
      cyan: identity,
      magenta: identity,
    };
  }

  return {
    success: (text: string) => pc.green(text),
    error: (text: string) => pc.red(text),
    warning: (text: string) => pc.yellow(text),
    info: (text: string) => pc.cyan(text),
    dim: (text: string) => pc.dim(text),
    bold: (text: string) => pc.bold(text),
    cyan: (text: string) => pc.cyan(text),
    magenta: (text: string) => pc.magenta(text),
  };
}

/**
 * Check if colors should be enabled
 * - Disabled if --no-color flag
 * - Disabled if stdout is not a TTY
 * - Disabled if NO_COLOR env var is set
 */
export function shouldEnableColors(noColorFlag: boolean): boolean {
  if (noColorFlag) {
    return false;
  }

  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  // Check if stderr is a TTY (we output progress/errors to stderr)
  return process.stderr.isTTY;
}
