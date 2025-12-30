/**
 * lt-data-sdk - TypeScript SDK for the Lithuanian Open Data platform (data.gov.lt)
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { SpintaClient, QueryBuilder } from 'lt-data-sdk';
 *
 * const client = new SpintaClient();
 *
 * // Query with fluent builder
 * const query = new QueryBuilder()
 *   .select('name', 'population')
 *   .filter(f => f.field('population').gt(10000))
 *   .sort('name')
 *   .limit(100);
 *
 * // Get single page of results
 * const cities = await client.getAll('datasets/gov/example/City', query);
 *
 * // Or stream all results with automatic pagination
 * for await (const city of client.stream('datasets/gov/example/City', query)) {
 *   console.log(city.name);
 * }
 * ```
 */

// QueryBuilder
export { QueryBuilder } from './builder/QueryBuilder.js';
export { FilterBuilder, filterToString } from './builder/FilterBuilder.js';
export type {
  FilterCallback,
  FilterExpression,
  FilterExpressionBuilder,
  ComparisonOperator,
  StringOperator,
  SortDirection,
  SortSpec,
} from './builder/types.js';

// SpintaClient
export { SpintaClient } from './client/SpintaClient.js';
export { TokenCache } from './client/auth.js';
export {
  SpintaError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from './client/errors.js';
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
} from './client/types.js';
