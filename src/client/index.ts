/**
 * SpintaClient module - HTTP client for Lithuanian Open Data API
 */

export { SpintaClient } from './SpintaClient.js';
export { TokenCache } from './auth.js';
export {
  SpintaError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from './errors.js';
export type {
  ClientConfig,
  SpintaObject,
  SpintaResponse,
  PageInfo,
  TokenResponse,
  CachedToken,
  CountResponse,
  SpintaErrorResponse,
  NamespaceItem,
  NamespaceResponse,
} from './types.js';
