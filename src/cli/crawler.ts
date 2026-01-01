/**
 * Namespace crawler for discovering models in the Spinta API
 */

import type { SpintaClient } from '../client/SpintaClient.js';

/** Model metadata from API */
export interface ModelMetadata {
  path: string;
  title?: string;
  description?: string;
  properties: PropertyMetadata[];
}

/** Property metadata from API */
export interface PropertyMetadata {
  name: string;
  type: string;
  ref?: string;
  title?: string;
  description?: string;
}

/** Namespace entry */
export interface NamespaceEntry {
  path: string;
  type: 'ns' | 'model';
  title?: string;
}

/**
 * Crawl a namespace and discover all models
 *
 * @param client - SpintaClient instance
 * @param namespace - Starting namespace path
 * @param recursive - Whether to recurse into sub-namespaces
 * @returns Array of model paths discovered
 */
export async function crawlNamespace(
  client: SpintaClient,
  namespace: string,
  recursive = true
): Promise<string[]> {
  const entries = await client.listNamespace(namespace);
  const models: string[] = [];

  for (const entry of entries) {
    if (entry._type === 'model') {
      models.push(entry._id);
    } else if (recursive) {
      // entry._type is 'ns' here (narrowed by TypeScript)
      const subModels = await crawlNamespace(client, entry._id, true);
      models.push(...subModels);
    }
  }

  return models;
}

/** Data sample response from API */
interface DataSampleResponse {
  _data: Record<string, unknown>[];
}

/**
 * Infer type from a JavaScript value
 * Enhanced to detect geometry (WKT), files, and external URLs
 */
function inferType(value: unknown): string {
  if (value === null) {
    return 'unknown';
  }
  if (typeof value === 'string') {
    // Check for WKT geometry formats (common in Lithuanian open data)
    // WKT format: POINT(...), LINESTRING(...), POLYGON(...), etc.
    if (/^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(/i.test(value)) {
      return 'geometry';
    }
    // Check for SRID-prefixed WKT: SRID=4326;POINT(...)
    if (/^SRID=\d+;/i.test(value)) {
      return 'geometry';
    }
    // Check for ISO date format
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.includes('T') ? 'datetime' : 'date';
    }
    // Check for UUID (ref)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return 'ref';
    }
    // Check for URL (file or external link)
    if (/^https?:\/\//i.test(value)) {
      // Files often have extensions like .pdf, .jpg, .doc, etc.
      if (/\.\w{2,5}($|\?)/i.test(value)) {
        return 'file';
      }
      return 'url';
    }
    return 'string';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'object') {
    // Check for file object structure FIRST (has _content_type or _size)
    // This must come before ref check since files also have _id
    if ('_content_type' in value || '_size' in value) {
      return 'file';
    }
    // Check for ref object with _id
    if ('_id' in value && typeof (value as Record<string, unknown>)._id === 'string') {
      return 'ref';
    }
    return 'object';
  }
  return 'unknown';
}

/**
 * Fetch model metadata by sampling actual data
 *
 * Since the :schema endpoint requires authentication, we infer types
 * from actual data by fetching a sample record.
 *
 * @param _client - SpintaClient instance (unused, using direct fetch)
 * @param modelPath - Full model path
 * @returns Model metadata with inferred properties
 */
export async function fetchModelMetadata(
  _client: SpintaClient,
  modelPath: string
): Promise<ModelMetadata> {
  // Fetch sample records to infer property types
  // Limit to 10 records to increase chance of finding non-null values
  const url = `https://get.data.gov.lt/${modelPath}?limit(10)`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch model data: ${String(response.status)}`);
    }

    const data = (await response.json()) as DataSampleResponse;
    const properties: PropertyMetadata[] = [];
    const propertyTypes = new Map<string, Set<string>>();

    // Scan all fetched records
    for (const record of data._data) {
      for (const [key, value] of Object.entries(record)) {
        // Skip internal Spinta fields
        if (key.startsWith('_')) {
          continue;
        }

        const type = inferType(value);
        if (!propertyTypes.has(key)) {
          propertyTypes.set(key, new Set());
        }
        propertyTypes.get(key)?.add(type);
      }
    }

    // Resolve final types
    for (const [key, types] of propertyTypes.entries()) {
      let finalType = 'unknown';

      // If we have concrete types, prioritize them over 'unknown'
      if (types.size > 0) {
        types.delete('unknown'); // Remove unknown from consideration if we have other types
      }

      if (types.size === 1) {
        // Single concrete type found
        finalType = types.values().next().value ?? 'unknown';
      } else if (types.size > 1) {
        // Multiple types found
        // Check for specific priority overrides
        if (types.has('ref')) finalType = 'ref';
        else if (types.has('string')) finalType = 'string'; // If mixed with string, it's a string
        else if (types.has('datetime')) finalType = 'datetime';
        else if (types.has('date')) finalType = 'date';
        else if (types.has('number') || types.has('integer')) finalType = 'number';
        else finalType = 'string'; // Fallback
      } else {
        // Only had unknown/null
        finalType = 'unknown';
      }

      properties.push({
        name: key,
        type: finalType,
      });
    }

    return {
      path: modelPath,
      properties,
    };
  } catch (error) {
    // Return minimal metadata on error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Warning: Could not fetch data for ${modelPath}: ${errorMessage}`);
    return {
      path: modelPath,
      properties: [],
    };
  }
}

/**
 * Fetch metadata for multiple models
 */
export async function fetchAllModelsMetadata(
  client: SpintaClient,
  modelPaths: readonly string[]
): Promise<ModelMetadata[]> {
  const metadata: ModelMetadata[] = [];

  for (const path of modelPaths) {
    const meta = await fetchModelMetadata(client, path);
    metadata.push(meta);
  }

  return metadata;
}
