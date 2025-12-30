/**
 * Custom error classes for Spinta API errors
 */

import type { SpintaErrorResponse } from './types.js';

/**
 * Base error class for Spinta-related errors
 */
export class SpintaError extends Error {
  public readonly status: number;
  public readonly body: SpintaErrorResponse | null;

  constructor(message: string, status: number, body: SpintaErrorResponse | null = null) {
    super(message);
    this.name = 'SpintaError';
    this.status = status;
    this.body = body;

    // Maintains proper stack trace for where error was thrown (V8 only)
    Error.captureStackTrace(this, SpintaError);
  }
}

/**
 * Authentication error (401/403)
 */
export class AuthenticationError extends SpintaError {
  constructor(message = 'Authentication failed', status = 401, body: SpintaErrorResponse | null = null) {
    super(message, status, body);
    this.name = 'AuthenticationError';
  }
}

/**
 * Resource not found error (404)
 */
export class NotFoundError extends SpintaError {
  constructor(message = 'Resource not found', body: SpintaErrorResponse | null = null) {
    super(message, 404, body);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error (400) - usually bad query parameters
 */
export class ValidationError extends SpintaError {
  constructor(message = 'Validation error', body: SpintaErrorResponse | null = null) {
    super(message, 400, body);
    this.name = 'ValidationError';
  }
}

/**
 * Parse error response body and throw appropriate error
 */
export async function handleErrorResponse(response: Response): Promise<never> {
  let body: SpintaErrorResponse | null = null;

  try {
    const text = await response.text();
    if (text !== '') {
      body = JSON.parse(text) as SpintaErrorResponse;
    }
  } catch {
    // Ignore JSON parse errors
  }

  const message = body?.message ?? body?.errors?.[0]?.message ?? response.statusText;

  switch (response.status) {
    case 400:
      throw new ValidationError(message, body);
    case 401:
    case 403:
      throw new AuthenticationError(message, response.status, body);
    case 404:
      throw new NotFoundError(message, body);
    default:
      throw new SpintaError(message, response.status, body);
  }
}
