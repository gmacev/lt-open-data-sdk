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

/** API response item from namespace endpoint */
interface ApiNamespaceItem {
  _id: string;
  _type: string;
  title?: string;
  description?: string;
  type?: string;
  ref?: string;
}

/** API response from namespace endpoint */
interface ApiNamespaceResponse {
  _data?: ApiNamespaceItem[];
  title?: string;
  description?: string;
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

/**
 * Fetch model metadata including properties
 *
 * @param _client - SpintaClient instance (unused, using direct fetch)
 * @param modelPath - Full model path
 * @returns Model metadata with properties
 */
export async function fetchModelMetadata(
  _client: SpintaClient,
  modelPath: string
): Promise<ModelMetadata> {
  // Fetch model schema from :ns endpoint on the model
  // This returns the model definition with properties
  const url = `https://get.data.gov.lt/${modelPath}/:ns`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch model metadata: ${String(response.status)}`);
    }

    const data = (await response.json()) as ApiNamespaceResponse;
    const properties: PropertyMetadata[] = [];

    // Parse properties from the response
    if (data._data !== undefined) {
      for (const item of data._data) {
        // Extract property name from path
        const parts = item._id.split('/');
        const propertyName = parts[parts.length - 1] ?? item._id;

        // Skip metadata entries that aren't properties
        if (item._type === 'property' || !item._type.startsWith('ns')) {
          properties.push({
            name: propertyName,
            type: item.type ?? 'unknown',
            ref: item.ref,
            title: item.title,
            description: item.description,
          });
        }
      }
    }

    return {
      path: modelPath,
      title: data.title,
      description: data.description,
      properties,
    };
  } catch (error) {
    // Return minimal metadata on error
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Warning: Could not fetch full metadata for ${modelPath}: ${errorMessage}`);
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
