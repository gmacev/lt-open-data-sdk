/**
 * Error utilities for CLI with defined exit codes
 */

export enum ExitCode {
  Success = 0,
  UserError = 1,
  ApiError = 2,
  InternalError = 3,
  PartialFailure = 4,
}

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCode,
    public readonly hint?: string
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class UserError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.UserError, hint);
    this.name = 'UserError';
  }
}

export class ApiError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, ExitCode.ApiError, hint);
    this.name = 'ApiError';
  }
}

export class PartialFailureError extends CliError {
  constructor(
    message: string,
    public readonly recordsFetched: number
  ) {
    super(message, ExitCode.PartialFailure);
    this.name = 'PartialFailureError';
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}

export function getExitCode(error: unknown): ExitCode {
  if (isCliError(error)) {
    return error.exitCode;
  }
  return ExitCode.InternalError;
}
