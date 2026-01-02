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
  ChangeEntry,
  ChangesResponse,
  SummaryBin,
  SummaryResponse,
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
   * **Warning**: Do NOT use `.select()` with `stream()`. The data.gov.lt API
   * does not return pagination tokens when field projection is used, causing
   * the stream to stop after the first page.
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
        description: item.description,
      };
    });
  }

  /**
   * Discover all models within a namespace (recursively)
   *
   * Traverses the namespace hierarchy and returns all model paths found.
   * Uses parallel fetching for sibling namespaces to improve performance.
   *
   * @param namespace - Starting namespace path (e.g., 'datasets/gov/rc')
   * @param concurrency - Max concurrent requests (default 5)
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
  async discoverModels(namespace: string, concurrency = 8): Promise<DiscoveredModel[]> {
    const models: DiscoveredModel[] = [];
    const minRequestIntervalMs = 50; // Minimum 50ms between any two request starts
    let lastRequestTime = 0;

    const throttledFetch = async (ns: string): Promise<NamespaceItem[]> => {
      // Ensure minimum interval between requests
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      if (elapsed < minRequestIntervalMs) {
        await new Promise(resolve => setTimeout(resolve, minRequestIntervalMs - elapsed));
      }
      lastRequestTime = Date.now();
      return this.listNamespace(ns);
    };

    const traverse = async (ns: string): Promise<void> => {
      const items = await throttledFetch(ns);

      // Separate models from sub-namespaces
      const subNamespaces: string[] = [];
      
      for (const item of items) {
        if (item._type === 'model') {
          models.push({
            path: item._id,
            title: item.title,
            namespace: ns,
          });
        } else {
          subNamespaces.push(item._id);
        }
      }

      // Process sub-namespaces in parallel batches
      for (let i = 0; i < subNamespaces.length; i += concurrency) {
        const batch = subNamespaces.slice(i, i + concurrency);
        await Promise.all(batch.map(subNs => traverse(subNs)));
      }
    };

    await traverse(namespace);
    return models;
  }

  /**
   * Get the latest change ID for a model
   *
   * Useful for initializing sync - get the current position before starting.
   *
   * @param model - Full model path (e.g., 'datasets/gov/example/City')
   * @returns The most recent change entry, or null if no changes exist
   *
   * @example
   * const latest = await client.getLatestChange('datasets/gov/example/City');
   * if (latest) {
   *   console.log('Last change ID:', latest._cid);
   * }
   */
  async getLatestChange<T>(model: string): Promise<(ChangeEntry<T>) | null> {
    // Use -1 to get the most recent change (negative numbers count from end)
    const path = `/${model}/:changes/-1`;
    try {
      const response = await this.request<ChangesResponse<T>>(path);
      return response._data[0] ?? null;
    } catch {
      // No changes exist yet
      return null;
    }
  }

  /**
   * Get the timestamp of the last update to a model
   *
   * Convenience method that returns when the dataset was last modified.
   * Useful for cache invalidation, freshness indicators, or conditional fetching.
   *
   * @param model - Full model path (e.g., 'datasets/gov/example/City')
   * @returns Date of last update, or null if no changes exist
   *
   * @example
   * const lastUpdate = await client.getLastUpdatedAt('datasets/gov/example/City');
   * if (lastUpdate) {
   *   console.log('Last updated:', lastUpdate.toISOString());
   * }
   */
  async getLastUpdatedAt(model: string): Promise<Date | null> {
    const latest = await this.getLatestChange(model);
    return latest ? new Date(latest._created) : null;
  }

  /**
   * Get changes since a specific change ID
   *
   * Returns a log of all data modifications (insert, update, delete) since
   * the given change ID. Use for incremental data synchronization.
   *
   * @param model - Full model path
   * @param sinceId - Change ID to start from (exclusive). Pass 0 or omit to get all changes.
   * @param limit - Maximum number of changes to return (default: 100)
   * @returns Array of change entries with operation type and data
   *
   * @example
   * // Initial sync: get current position
   * const latest = await client.getLatestChange('datasets/gov/example/City');
   * let lastId = latest?._cid ?? 0;
   *
   * // Incremental sync: get changes since last sync
   * const changes = await client.getChanges('datasets/gov/example/City', lastId);
   * for (const change of changes) {
   *   if (change._op === 'insert') {
   *     // Handle new record
   *   } else if (change._op === 'update' || change._op === 'patch') {
   *     // Handle modification
   *   } else if (change._op === 'delete') {
   *     // Handle deletion
   *   }
   *   lastId = change._cid;
   * }
   */
  async getChanges<T>(
    model: string,
    sinceId?: number,
    limit = 100
  ): Promise<ChangeEntry<T>[]> {
    const changeId = sinceId ?? 0;
    const path = `/${model}/:changes/${String(changeId)}`;
    const queryString = `?limit(${String(limit)})`;
    const response = await this.request<ChangesResponse<T>>(path, queryString);
    return response._data;
  }

  /**
   * Stream all changes since a specific ID with automatic pagination
   *
   * @param model - Full model path
   * @param sinceId - Change ID to start from (exclusive)
   * @param pageSize - Number of changes per page (default: 100)
   * @yields Change entries one at a time
   *
   * @example
   * for await (const change of client.streamChanges('datasets/gov/example/City', 0)) {
   *   console.log(change._op, change._id);
   * }
   */
  async *streamChanges<T>(
    model: string,
    sinceId = 0,
    pageSize = 100
  ): AsyncGenerator<ChangeEntry<T>, void, undefined> {
    let lastId = sinceId;
    let hasMore = true;

    while (hasMore) {
      const changes = await this.getChanges<T>(model, lastId, pageSize);
      if (changes.length === 0) {
        break;
      }

      for (const change of changes) {
        yield change;
        lastId = change._cid;
      }

      // If we got fewer than requested, we've reached the end
      hasMore = changes.length >= pageSize;
    }
  }

  /**
   * Get histogram/distribution summary for a numeric field
   *
   * Returns binned counts showing the distribution of values for a field.
   * Useful for data exploration, profiling, and visualization.
   *
   * @param model - Full model path (e.g., 'datasets/gov/example/City')
   * @param field - Numeric field to summarize (e.g., 'population')
   * @returns Array of bins with value ranges and counts
   *
   * @example
   * const histogram = await client.getSummary(
   *   'datasets/gov/rc/ar/savivaldybe/Savivaldybe',
   *   'sav_kodas'
   * );
   * for (const bin of histogram) {
   *   console.log(`Value ~${bin.bin}: ${bin.count} records`);
   * }
   */
  async getSummary(
    model: string,
    field: string
  ): Promise<SummaryBin[]> {
    const path = `/${model}/:summary/${field}`;
    const response = await this.request<SummaryResponse>(path);
    return response._data;
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
  description?: string;
}

