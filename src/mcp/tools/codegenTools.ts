/**
 * Code generation tools for MCP server
 * 
 * Generates TypeScript interfaces from dataset schemas.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpintaClient } from '../../client/SpintaClient.js';
import { fetchModelMetadata } from '../../cli/crawler.js';

const client = new SpintaClient();

export function registerCodegenTools(server: McpServer): void {
  // generate_types - Generate TypeScript interfaces from actual data
  server.registerTool(
    'generate_types',
    {
      description: 'Generate TypeScript interfaces for a dataset. ' +
        'Infers types from actual data samples, not just metadata. ' +
        'Returns .d.ts content ready to use in TypeScript projects.',
      inputSchema: {
        namespace: z.string().describe('Namespace or model path'),
        recursive: z.boolean().default(false).describe('Include nested namespaces (slower)'),
      },
    },
    async ({ namespace, recursive }) => {
      // Discover models in namespace
      const models = recursive 
        ? await client.discoverModels(namespace)
        : [{ path: namespace, title: undefined }];

      if (models.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No models found in this namespace.' }] };
      }

      // Limit to avoid timeout
      const toProcess = models.slice(0, 5);
      const interfaces: string[] = [];
      const errors: string[] = [];

      for (const model of toProcess) {
        try {
          const metadata = await fetchModelMetadata(client, model.path);
          
          if (metadata.properties.length === 0) {
            errors.push(`${model.path}: no fields found`);
            continue;
          }

          // Generate interface
          const name = model.path.split('/').pop() ?? 'Unknown';
          const fields = metadata.properties.map(p => {
            const tsType = mapToTsType(p.type);
            return `  ${p.name}?: ${tsType};`;
          });

          interfaces.push([
            `/** ${model.path} */`,
            `export interface ${name} {`,
            '  _id: string;',
            ...fields,
            '}'
          ].join('\n'));
        } catch {
          errors.push(`${model.path}: fetch failed`);
        }
      }

      if (interfaces.length === 0) {
        return { content: [{ type: 'text' as const, text: 'Could not generate interfaces. ' + errors.join(', ') }] };
      }

      let result = interfaces.join('\n\n');
      
      if (models.length > 5) {
        result += `\n\n// Note: Only first 5 of ${String(models.length)} models shown.`;
      }
      if (errors.length > 0) {
        result += `\n\n// Errors: ${errors.join(', ')}`;
      }

      return { content: [{ type: 'text' as const, text: result }] };
    }
  );
}

/**
 * Map inferred type to TypeScript type
 */
function mapToTsType(type: string): string {
  switch (type) {
    case 'string':
    case 'text':
    case 'url':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
      return 'string'; // ISO date string
    case 'ref':
      return '{ _id: string }';
    case 'geometry':
      return 'string'; // WKT
    case 'file':
      return '{ _id: string; _content_type?: string }';
    default:
      return 'unknown';
  }
}
