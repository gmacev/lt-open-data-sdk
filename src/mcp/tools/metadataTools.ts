/**
 * Metadata tools for MCP server
 * 
 * Tools for discovering and understanding datasets before querying.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpintaClient } from '../../client/SpintaClient.js';
import { fetchModelMetadata } from '../../cli/crawler.js';
import { QueryBuilder } from '../../builder/QueryBuilder.js';

const client = new SpintaClient();

export function registerMetadataTools(server: McpServer): void {
  // list_namespace - Browse dataset hierarchy (ENTRY POINT)
  server.registerTool(
    'list_namespace',
    {
      description: 
        'START HERE: List namespaces and datasets within a path. ' +
        'Begin with "datasets/gov" to see all government data providers. ' +
        'Drill down through namespaces until you find a "model" (actual dataset). ' +
        'Example flow: list_namespace("datasets/gov") → list_namespace("datasets/gov/rc") → find models',
      inputSchema: {
        namespace: z.string().default('datasets/gov').describe('Namespace path. Start with "datasets/gov"'),
      },
    },
    async ({ namespace }) => {
      const items = await client.listNamespace(namespace);
      
      // Format with titles and descriptions for better context
      const lines = items.map(item => {
        const typeLabel = item._type === 'ns' ? '📁' : '📊';
        const title = item.title !== undefined && item.title !== '' ? ` - ${item.title}` : '';
        const desc = item.description !== undefined && item.description !== '' 
          ? `\n     ${item.description}`
          : '';
        return `${typeLabel} ${item._id}${title}${desc}`;
      });
      
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // search_datasets - Find datasets by keyword
  server.registerTool(
    'search_datasets',
    {
      description: 
        'Search for datasets by keyword. Returns paths with titles and descriptions. ' +
        'Use this to find relevant datasets before querying. ' +
        'After finding a dataset, use describe_model to see its fields.',
      inputSchema: {
        query: z.string().describe('Search keyword (matches path, title, or description)'),
        namespace: z.string().default('datasets/gov').describe('Starting namespace'),
        max_results: z.number().default(20).describe('Maximum results'),
      },
    },
    async ({ query, namespace, max_results }) => {
      const models = await client.discoverModels(namespace);
      const queryLower = query.toLowerCase();
      
      const matches = models
        .filter(m => 
          m.path.toLowerCase().includes(queryLower) ||
          (m.title?.toLowerCase().includes(queryLower) ?? false)
        )
        .slice(0, max_results);
      
      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No matching datasets found.' }] };
      }
      
      const lines = matches.map(m => {
        const title = m.title ?? '(no title)';
        return `${m.path}\n  → ${title}`;
      });
      
      return { 
        content: [{ 
          type: 'text' as const, 
          text: `Found ${String(matches.length)} datasets:\n\n${lines.join('\n\n')}` 
        }] 
      };
    }
  );

  // describe_model - Get schema with auto-fallback to sampling
  server.registerTool(
    'describe_model',
    {
      description: 
        'IMPORTANT: Use this before query_data to understand the schema. ' +
        'Returns field names and their types (string, integer, date, ref, etc). ' +
        'This helps you write correct filters and know what data to expect.',
      inputSchema: {
        model: z.string().describe('Full dataset path, e.g. "datasets/gov/rc/ar/savivaldybe/Savivaldybe"'),
      },
    },
    async ({ model }) => {
      const metadata = await fetchModelMetadata(client, model);
      
      // If no properties found from metadata, try sampling
      if (metadata.properties.length === 0) {
        // Fallback: sample data and infer fields
        try {
          const query = new QueryBuilder().limit(5);
          const samples = await client.getAll(model, query);
          
          if (samples.length === 0) {
            return { 
              content: [{ 
                type: 'text' as const, 
                text: `Model: ${model}\n\nNo data available in this dataset.` 
              }] 
            };
          }
          
          // Infer fields from sample
          const fieldTypes = new Map<string, string>();
          for (const record of samples) {
            for (const [key, value] of Object.entries(record)) {
              if (!key.startsWith('_') && !fieldTypes.has(key)) {
                fieldTypes.set(key, typeof value);
              }
            }
          }
          
          const fields = Array.from(fieldTypes.entries())
            .map(([name, type]) => `  - ${name}: ${type}`);
          
          return { 
            content: [{ 
              type: 'text' as const, 
              text: `Model: ${model}\n\nFields (inferred from data):\n${fields.join('\n')}` 
            }] 
          };
        } catch {
          return { 
            content: [{ 
              type: 'text' as const, 
              text: `Model: ${model}\n\nCould not determine schema or sample data.` 
            }] 
          };
        }
      }
      
      const lines = [
        `Model: ${model}`,
        metadata.title !== undefined && metadata.title !== '' ? `Title: ${metadata.title}` : null,
        metadata.description !== undefined && metadata.description !== '' ? `Description: ${metadata.description}` : null,
        '',
        'Fields:',
        ...metadata.properties.map(p => `  - ${p.name}: ${p.type}`)
      ].filter(Boolean);
      
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // get_last_updated - Check dataset freshness
  server.registerTool(
    'get_last_updated',
    {
      description: 'Get the timestamp of when a dataset was last updated. Useful for checking data freshness.',
      inputSchema: {
        model: z.string().describe('Full dataset path'),
      },
    },
    async ({ model }) => {
      const lastUpdate = await client.getLastUpdatedAt(model);
      if (lastUpdate !== null) {
        const hoursAgo = Math.round((Date.now() - lastUpdate.getTime()) / 1000 / 60 / 60);
        const daysAgo = Math.round(hoursAgo / 24);
        const timeDesc = daysAgo > 0 ? `${String(daysAgo)} days ago` : `${String(hoursAgo)} hours ago`;
        return {
          content: [{ 
            type: 'text' as const, 
            text: `Last updated: ${lastUpdate.toISOString()} (${timeDesc})`
          }],
        };
      }
      return { content: [{ type: 'text' as const, text: 'No update history available.' }] };
    }
  );

  // get_summary - Histogram with cleaner output
  server.registerTool(
    'get_summary',
    {
      description: 'Get a histogram/distribution for a numeric field (Server-side). Shows value ranges and counts with percentages.',
      inputSchema: {
        model: z.string().describe('Full dataset path'),
        field: z.string().describe('Numeric field name to summarize'),
      },
    },
    async ({ model, field }) => {
      const summary = await client.getSummary(model, field);
      
      if (summary.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No summary data available.' }] };
      }
      
      const total = summary.reduce((sum, bin) => sum + bin.count, 0);
      const nonEmpty = summary.filter(b => b.count > 0);
      
      const lines = nonEmpty.map(bin => {
        const binVal = typeof bin.bin === 'number' ? Math.round(bin.bin) : bin.bin;
        const pct = ((bin.count / total) * 100).toFixed(1);
        return `  ${String(binVal)}: ${String(bin.count)} (${pct}%)`;
      });
      
      return {
        content: [{ 
          type: 'text' as const, 
          text: `Distribution of "${field}" (${String(total)} total records):\n${lines.join('\n')}`
        }],
      };
    }
  );

  // analyze_distribution - Client-side sampling for strings/categorical
  server.registerTool(
    'analyze_distribution',
    {
      description: 
        'Analyze the distribution of values for a field by sampling data. ' +
        'Use this for categorical fields (strings) to find "Top N" values, or when get_summary fails. ' +
        'Note: Results are ESTIMATES based on a sample.',
      inputSchema: {
        model: z.string().describe('Full dataset path'),
        field: z.string().describe('Field name to analyze (e.g., "category", "city")'),
        sample_size: z.number().default(1000).describe('Number of records to sample (max 500000)'),
      },
    },
    async ({ model, field, sample_size }) => {
      const limit = Math.min(sample_size, 500000);
      const query = new QueryBuilder().limit(limit);
      
      // Try to fetch latest data if possible (though default is random/insertion order often)
      // We can't easily sort by date without knowing the date field, so we just take default order.
      
      const data = await client.getAll(model, query);
      
      if (data.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No data found to sample.' }] };
      }
      
      // Aggregate locally
      const counts = new Map<string | number, number>();
      let validCount = 0;
      
      for (const record of data) {
        if (field in record) {
          const value = record[field];
          if (value !== null && value !== undefined) {
            let key = 'undefined';
            
            if (typeof value === 'string') {
               key = value;
            } else if (typeof value === 'number' || typeof value === 'boolean') {
               key = String(value);
            } else {
               try {
                 // JSON.stringify can return undefined
                 const json = JSON.stringify(value);
                 if (json) {
                   key = json;
                 }
               } catch {
                 key = 'Error: Value cannot be stringified';
               }
            }
            
            counts.set(key, (counts.get(key) ?? 0) + 1);
            validCount++;
          }
        }
      }
      
      if (validCount === 0) {
        return { content: [{ type: 'text' as const, text: `Field "${field}" not found or empty in sample of ${String(data.length)} records.` }] };
      }
      
      // Sort by frequency
      const sorted = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100); // Top 100
        
      const lines = sorted.map(([val, count]) => {
        const pct = ((count / validCount) * 100).toFixed(1);
        // Truncate very long values
        const stringVal = String(val);
        const displayVal = stringVal.length > 100 ? stringVal.slice(0, 100) + '...' : stringVal;
        return `  ${displayVal}: ${String(count)} (${pct}%)`;
      });
      
      return {
        content: [{ 
          type: 'text' as const, 
          text: `Distribution of "${field}" (based on sample of ${String(data.length)} records):\n${lines.join('\n')}`
        }],
      };
    }
  );
}
