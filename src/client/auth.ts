/**
 * OAuth token management for Spinta API
 */

import type { TokenResponse, CachedToken } from './types.js';
import { AuthenticationError } from './errors.js';

/** Buffer time before token expiry to trigger refresh (5 minutes) */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** OAuth error response shape */
interface OAuthErrorResponse {
  error?: string;
  error_description?: string;
}

/**
 * Token cache for managing OAuth tokens
 */
export class TokenCache {
  private cachedToken: CachedToken | null = null;

  private readonly authUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scopes: readonly string[];

  constructor(
    authUrl: string,
    clientId: string,
    clientSecret: string,
    scopes: readonly string[]
  ) {
    this.authUrl = authUrl;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.scopes = scopes;
  }

  /**
   * Check if current token is valid (exists and not near expiry)
   */
  isValid(): boolean {
    if (this.cachedToken === null) {
      return false;
    }
    // Check if token expires in less than buffer time
    return Date.now() < this.cachedToken.expiresAt - EXPIRY_BUFFER_MS;
  }

  /**
   * Get current token, fetching or refreshing if needed
   */
  async getToken(): Promise<string> {
    if (!this.isValid()) {
      await this.refresh();
    }

    // After refresh, cachedToken is guaranteed to be set
    if (this.cachedToken === null) {
      throw new AuthenticationError('Failed to obtain access token');
    }

    return this.cachedToken.accessToken;
  }

  /**
   * Fetch a new token from the auth server
   */
  private async refresh(): Promise<void> {
    const url = `${this.authUrl}/auth/token`;

    // Create Basic auth header
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: this.scopes.join(' '),
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to obtain access token';
      try {
        const errorBody: unknown = await response.json();
        if (isOAuthErrorResponse(errorBody) && typeof errorBody.error_description === 'string') {
          errorMessage = errorBody.error_description;
        }
      } catch {
        // Ignore JSON parse errors
      }
      throw new AuthenticationError(errorMessage, response.status);
    }

    const data = (await response.json()) as TokenResponse;

    this.cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  /**
   * Clear the cached token (useful for logout or forced refresh)
   */
  clear(): void {
    this.cachedToken = null;
  }
}

/**
 * Type guard for OAuth error response
 */
function isOAuthErrorResponse(value: unknown): value is OAuthErrorResponse {
  return typeof value === 'object' && value !== null;
}
