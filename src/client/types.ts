/**
 * Type definitions for the SpintaClient module
 */

/** OAuth token response from Spinta auth endpoint */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/** Cached token with expiry tracking */
export interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

/** Client configuration options */
export interface ClientConfig {
  /**
   * Base URL for the Spinta API
   * @default 'https://get.data.gov.lt'
   */
  baseUrl?: string;

  /**
   * OAuth client ID for authenticated requests
   * If not provided, only public data can be accessed
   */
  clientId?: string;

  /**
   * OAuth client secret for authenticated requests
   */
  clientSecret?: string;

  /**
   * Auth server URL (different from data server for data.gov.lt)
   * @default 'https://put.data.gov.lt'
   */
  authUrl?: string;

  /**
   * OAuth scopes to request
   * @default ['spinta_getone', 'spinta_getall', 'spinta_search', 'spinta_changes']
   */
  scopes?: string[];
}

/** Spinta object base metadata */
export interface SpintaObject {
  _id: string;
  _type: string;
  _revision?: string;
  _txn?: string;
}

/** Page information for pagination */
export interface PageInfo {
  /**
   * Base64-encoded token for the next page
   * If undefined, there are no more pages
   */
  next?: string;
}

/**
 * Response wrapper from Spinta getall endpoints
 * Use `getAllRaw()` to get this structure, or `getAll()` for just the data array
 */
export interface SpintaResponse<T> {
  _type: string;
  _data: (T & SpintaObject)[];
  _page?: PageInfo;
}

/** Response from count queries */
export interface CountResponse {
  _type: string;
  _data: [{ 'count()': number }];
}

/** Spinta error response structure */
export interface SpintaErrorResponse {
  type?: string;
  code?: string;
  message?: string;
  errors?: {
    type?: string;
    code?: string;
    context?: Record<string, unknown>;
    message?: string;
  }[];
}

/** Namespace item from /:ns endpoint */
export interface NamespaceItem {
  _id: string;
  _type: 'ns' | 'model';
  title?: string;
}

/** Namespace listing response */
export interface NamespaceResponse {
  _data: NamespaceItem[];
}

/** Operation types for change entries */
export type ChangeOperation = 'insert' | 'update' | 'patch' | 'delete';

/**
 * Change entry from the /:changes endpoint
 * Represents a single data modification event
 */
export interface ChangeEntry<T> {
  /** Change ID - monotonically increasing, use for pagination */
  _cid: number;
  /** Timestamp of the change (ISO 8601) */
  _created: string;
  /** Type of operation performed */
  _op: ChangeOperation;
  /** Transaction ID */
  _txn: string;
  /** Revision after the change */
  _revision: string;
  /** ID of the modified object */
  _id: string;
  /** The data after modification (not present for delete) */
  _data?: T;
}

/** Response wrapper for changes endpoint */
export interface ChangesResponse<T> {
  _data: ChangeEntry<T>[];
}
