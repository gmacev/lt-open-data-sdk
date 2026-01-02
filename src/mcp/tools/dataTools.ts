/**
 * Data access tools for MCP server
 * 
 * Core tools for querying Lithuanian open data.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpintaClient } from '../../client/SpintaClient.js';
import { QueryBuilder } from '../../builder/QueryBuilder.js';

const client = new SpintaClient();

/**
 * Parse a simple filter string into QueryBuilder operations
 * Returns error message if filter is invalid
 */
function parseFilter(query: QueryBuilder, filterStr: string): { query: QueryBuilder; error?: string } {
  // Handle contains
  const containsMatch = /^(\w+)\.contains\("(.+)"\)$/.exec(filterStr);
  if (containsMatch !== null) {
    const field = containsMatch[1];
    const value = containsMatch[2];
    if (field !== undefined && value !== undefined) {
      return { query: query.filter(f => f.field(field).contains(value)) };
    }
  }

  // Handle startswith
  const startsMatch = /^(\w+)\.startswith\("(.+)"\)$/.exec(filterStr);
  if (startsMatch !== null) {
    const field = startsMatch[1];
    const value = startsMatch[2];
    if (field !== undefined && value !== undefined) {
      return { query: query.filter(f => f.field(field).startswith(value)) };
    }
  }

  // Handle comparison operators
  const compMatch = /^(\w+)(>=|<=|>|<|!=|=)(.+)$/.exec(filterStr);
  if (compMatch !== null) {
    const field = compMatch[1];
    const op = compMatch[2];
    const rawValue = compMatch[3];
    
    if (field === undefined || op === undefined || rawValue === undefined) {
      return { query, error: `Could not parse filter "${filterStr}"` };
    }
    
    // Parse value
    let value: string | number;
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      value = rawValue.slice(1, -1);
    } else if (!isNaN(Number(rawValue))) {
      value = Number(rawValue);
    } else {
      return { 
        query, 
        error: `Invalid filter value "${rawValue}". Use quotes for strings: ${field}${op}"${rawValue}"` 
      };
    }

    return {
      query: query.filter(f => {
        const fieldFilter = f.field(field);
        switch (op) {
          case '=': return fieldFilter.eq(value);
          case '!=': return fieldFilter.ne(value);
          case '>': return fieldFilter.gt(value as number);
          case '>=': return fieldFilter.ge(value as number);
          case '<': return fieldFilter.lt(value as number);
          case '<=': return fieldFilter.le(value as number);
          default: return fieldFilter.eq(value);
        }
      })
    };
  }

  return { 
    query, 
    error: `Could not parse filter "${filterStr}". Examples: field=123, field>"text", field.contains("text")` 
  };
}

/**
 * Strip Spinta metadata from records for cleaner output
 */
function compactRecord(record: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === '_id' || !key.startsWith('_')) {
      result[key] = value;
    }
  }
  return result;
}

export function registerDataTools(server: McpServer): void {
  // query_data - Main query tool
  server.registerTool(
    'query_data',
    {
      description: 
        'Query a Lithuanian open data dataset with filtering, sorting, and pagination. ' +
        'IMPORTANT: First use describe_model to see available fields. ' +
        'Filter syntax: field=value, field>100, field.contains("text"). ' +
        'Sort: field or -field for descending. ' +
        'Example: query_data({ model: "datasets/gov/rc/ar/savivaldybe/Savivaldybe", filter: "sav_kodas>50", limit: 5 })',
      inputSchema: {
        model: z.string().describe('Full dataset path like "datasets/gov/rc/ar/savivaldybe/Savivaldybe"'),
        filter: z.string().optional().describe('Filter: "population>50000" or "name.contains(\\"Vilnius\\")"'),
        sort: z.string().optional().describe('Sort field, prefix with - for descending'),
        limit: z.number().default(20).describe('Max records (default 20, max 1000)'),
        compact: z.boolean().default(true).describe('Strip metadata fields for cleaner output'),
      },
    },
    async ({ model, filter, sort, limit, compact }) => {
      let query: QueryBuilder = new QueryBuilder().limit(Math.min(limit, 1000));

      if (filter !== undefined && filter !== '') {
        const result = parseFilter(query, filter);
        if (result.error !== undefined) {
          return { content: [{ type: 'text' as const, text: `Filter error: ${result.error}` }] };
        }
        query = result.query;
      }

      if (sort !== undefined && sort !== '') {
        if (sort.startsWith('-')) {
          query = query.sortDesc(sort.slice(1));
        } else {
          query = query.sort(sort);
        }
      }

      const data = await client.getAll(model, query);
      const output = compact ? data.map(r => compactRecord(r)) : data;
      
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    }
  );

  // get_record - Fetch single record
  server.registerTool(
    'get_record',
    {
      description: 'Fetch a single record by its ID. Use _id value from query_data results.',
      inputSchema: {
        model: z.string().describe('Full dataset path'),
        id: z.string().describe('Record ID (_id field value)'),
        compact: z.boolean().default(true).describe('Strip metadata fields'),
      },
    },
    async ({ model, id, compact }) => {
      const record = await client.getOne(model, id);
      const output = compact ? compactRecord(record) : record;
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    }
  );

  // count_records - Count matching records
  server.registerTool(
    'count_records',
    {
      description: 'Count records in a dataset, optionally with a filter. Fast way to check dataset size.',
      inputSchema: {
        model: z.string().describe('Full dataset path'),
        filter: z.string().optional().describe('Optional filter expression'),
      },
    },
    async ({ model, filter }) => {
      let query = new QueryBuilder();
      if (filter !== undefined && filter !== '') {
        const result = parseFilter(query, filter);
        if (result.error !== undefined) {
          return { content: [{ type: 'text' as const, text: `Filter error: ${result.error}` }] };
        }
        query = result.query;
      }
      const count = await client.count(model, query);
      return { content: [{ type: 'text' as const, text: `Total records: ${String(count)}` }] };
    }
  );

  // get_sample_data - Get sample from dataset
  server.registerTool(
    'get_sample_data',
    {
      description: 'Get a sample of records from a dataset. Useful for understanding data structure when describe_model is not enough.',
      inputSchema: {
        model: z.string().describe('Full dataset path'),
        count: z.number().default(10).describe('Number of sample records (max 100)'),
      },
    },
    async ({ model, count }) => {
      const sampleSize = Math.min(count, 100);
      const query = new QueryBuilder().limit(sampleSize);
      const data = await client.getAll(model, query);
      const output = data.map(r => compactRecord(r));
      return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] };
    }
  );
}
