/**
 * SpintaClient - HTTP client for the Lithuanian Open Data API (data.gov.lt)
 *
 * @example
 * ```typescript
 * import { SpintaClient, QueryBuilder } from 'lt-open-data-sdk';
 *
 * const client = new SpintaClient();
 *
 * // Get all items (single page - uses limit from query or API default)
 * const cities = await client.getAll('datasets/gov/example/City');
 *
 * // Stream all items with automatic pagination
 * for await (const city of client.stream('datasets/gov/example/City')) {
 *   console.log(city.name);
 * }
 *
 * // With query builder
 * const query = new QueryBuilder()
 *   .select('name', 'population')
 *   .filter(f => f.field('population').gt(100000))
 *   .limit(100);
 *
 * const largeCities = await client.getAll('datasets/gov/example/City', query);
 * ```
 */

import type {
  ClientConfig,
  SpintaObject,
  SpintaResponse,
  CountResponse,
} from './types.js';
import { TokenCache } from './auth.js';
import { handleErrorResponse } from './errors.js';
import type { QueryBuilder } from '../builder/QueryBuilder.js';

/** Default configuration values */
const DEFAULT_BASE_URL = 'https://get.data.gov.lt';
const DEFAULT_AUTH_URL = 'https://put.data.gov.lt';
const DEFAULT_SCOPES: readonly string[] = [
  'spinta_getone',
  'spinta_getall',
  'spinta_search',
  'spinta_changes',
] as const;

export class SpintaClient {
  private readonly baseUrl: string;
  private readonly tokenCache: TokenCache | null;

  constructor(config: ClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');

    // Initialize token cache only if credentials are provided
    if (config.clientId !== undefined && config.clientSecret !== undefined) {
      this.tokenCache = new TokenCache(
        config.authUrl ?? DEFAULT_AUTH_URL,
        config.clientId,
        config.clientSecret,
        config.scopes ?? DEFAULT_SCOPES
      );
    } else {
      this.tokenCache = null;
    }
  }

  /**
   * Build headers for API requests
   * Refreshes token if needed before each request
   */
  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.tokenCache !== null) {
      const token = await this.tokenCache.getToken();
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Make an HTTP request to the API
   */
  private async request<T>(path: string, query = ''): Promise<T> {
    const url = `${this.baseUrl}${path}${query}`;
    const headers = await this.getHeaders();

    const response = await fetch(url, { headers });

    if (!response.ok) {
      await handleErrorResponse(response);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get a single object by its UUID
   *
   * @param model - Full model path (e.g., 'datasets/gov/example/City')
   * @param id - Object UUID
   * @returns The object with metadata
   *
   * @example
   * const city = await client.getOne('datasets/gov/example/City', 'abc123-...');
   */
  async getOne<T>(model: string, id: string): Promise<T & SpintaObject> {
    const path = `/${model}/${id}`;
    return this.request<T & SpintaObject>(path);
  }

  /**
   * Get objects from a model (single page only)
   *
   * **Note**: This fetches ONE page of results based on the limit in your query
   * (or the API's default limit). It does NOT download all records.
   * For large datasets, use `stream()` which handles pagination automatically.
   *
   * @param model - Full model path (e.g., 'datasets/gov/example/City')
   * @param query - Optional query builder for filtering, sorting, limiting
   * @returns Array of objects with metadata (unwrapped from _data)
   *
   * @example
   * // Get first 100 cities
   * const query = new QueryBuilder().limit(100);
   * const cities = await client.getAll('datasets/gov/example/City', query);
   */
  async getAll<T>(
    model: string,
    query?: QueryBuilder<T>
  ): Promise<(T & SpintaObject)[]> {
    const response = await this.getAllRaw(model, query);
    return response._data;
  }

  /**
   * Get raw response with metadata (includes _type, _page info)
   *
   * Use this when you need pagination info or the response type.
   *
   * @param model - Full model path
   * @param query - Optional query builder
   * @returns Full Spinta response with _data array and _page info
   */
  async getAllRaw<T>(
    model: string,
    query?: QueryBuilder<T>
  ): Promise<SpintaResponse<T>> {
    const path = `/${model}`;
    const queryString = query?.toQueryString() ?? '';
    return this.request<SpintaResponse<T>>(path, queryString);
  }

  /**
   * Stream all objects with automatic pagination
   *
   * Implements an async iterator that automatically fetches subsequent pages
   * using the `_page.next` token. Validates token before each page fetch to
   * avoid mid-stream auth failures on large datasets.
   *
   * @param model - Full model path
   * @param query - Optional query builder (should include limit for page size)
   * @yields Objects one at a time with metadata
   *
   * @example
   * // Stream all cities with a filter
   * const query = new QueryBuilder()
   *   .filter(f => f.field('population').gt(10000))
   *   .limit(1000); // Page size
   *
   * for await (const city of client.stream('datasets/gov/example/City', query)) {
   *   console.log(city.name);
   * }
   */
  async *stream<T>(
    model: string,
    query?: QueryBuilder<T>
  ): AsyncGenerator<T & SpintaObject, void, undefined> {
    const path = `/${model}`;
    const baseQuery = query?.toQueryString() ?? '';
    let pageToken: string | undefined;

    do {
      // Build query with page token if we have one
      let queryString = baseQuery;
      if (pageToken !== undefined) {
        const separator = baseQuery !== '' ? '&' : '?';
        queryString = `${baseQuery}${separator}page("${pageToken}")`;
      }

      // Fetch page (getHeaders validates token before each request)
      const response = await this.request<SpintaResponse<T>>(path, queryString);

      // Yield each item
      for (const item of response._data) {
        yield item;
      }

      // Get next page token
      pageToken = response._page?.next;
    } while (pageToken !== undefined);
  }

  /**
   * Count objects matching a query
   *
   * @param model - Full model path
   * @param query - Optional query builder for filtering (sort/select are ignored)
   * @returns Number of matching objects
   *
   * @example
   * const query = new QueryBuilder().filter(f => f.field('population').gt(100000));
   * const count = await client.count('datasets/gov/example/City', query);
   */
  async count<T>(model: string, query?: QueryBuilder<T>): Promise<number> {
    const path = `/${model}`;

    // Build count query
    let queryString = query?.toQueryString() ?? '';
    const separator = queryString !== '' ? '&' : '?';
    queryString = `${queryString}${separator}count()`;

    const response = await this.request<CountResponse>(path, queryString);

    const countValue = response._data[0];
    return countValue['count()'];
  }

  /**
   * List contents of a namespace
   *
   * @param namespace - Namespace path (e.g., 'datasets/gov/ivpk')
   * @returns Array of namespace items (sub-namespaces and models)
   *
   * @example
   * const items = await client.listNamespace('datasets/gov/ivpk');
   * for (const item of items) {
   *   if (item._type === 'ns') {
   *     console.log('Namespace:', item._id);
   *   } else {
   *     console.log('Model:', item._id);
   *   }
   * }
   */
  async listNamespace(namespace: string): Promise<NamespaceItem[]> {
    const path = `/${namespace}/:ns`;
    const response = await this.request<RawNamespaceResponse>(path);

    // Transform API response to NamespaceItem format
    // API returns: { name: "path/:ns" or "path/Model", title, description }
    return response._data.map((item): NamespaceItem => {
      const isNamespace = item.name.endsWith('/:ns');
      const cleanPath = isNamespace
        ? item.name.slice(0, -4) // Remove '/:ns' suffix
        : item.name;

      return {
        _id: cleanPath,
        _type: isNamespace ? 'ns' : 'model',
        title: item.title,
      };
    });
  }

  /**
   * Discover all models within a namespace (recursively)
   *
   * Traverses the namespace hierarchy and returns all model paths found.
   * Useful for exploring what data is available in a given area.
   *
   * @param namespace - Starting namespace path (e.g., 'datasets/gov/rc')
   * @returns Array of discovered models with path and title
   *
   * @example
   * ```typescript
   * // Find all models in the Registry Centre
   * const models = await client.discoverModels('datasets/gov/rc');
   * console.log(`Found ${models.length} models`);
   * for (const model of models) {
   *   console.log(`- ${model.title ?? model.path}`);
   * }
   * ```
   */
  async discoverModels(namespace: string): Promise<DiscoveredModel[]> {
    const models: DiscoveredModel[] = [];

    const traverse = async (ns: string): Promise<void> => {
      const items = await this.listNamespace(ns);

      for (const item of items) {
        if (item._type === 'model') {
          models.push({
            path: item._id,
            title: item.title,
            namespace: ns,
          });
        } else {
          // Recurse into sub-namespace
          await traverse(item._id);
        }
      }
    };

    await traverse(namespace);
    return models;
  }
}

/** Discovered model from namespace traversal */
export interface DiscoveredModel {
  /** Full model path (e.g., 'datasets/gov/rc/ar/savivaldybe/Savivaldybe') */
  path: string;
  /** Human-readable title from API metadata */
  title?: string;
  /** Parent namespace path */
  namespace: string;
}

/** Raw API response item from /:ns endpoint */
interface RawNamespaceItem {
  name: string;
  title: string;
  description: string;
}

/** Raw API response from /:ns endpoint */
interface RawNamespaceResponse {
  _data: RawNamespaceItem[];
}

/** Namespace item type (transformed) */
interface NamespaceItem {
  _id: string;
  _type: 'ns' | 'model';
  title?: string;
}

