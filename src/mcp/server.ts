/**
 * MCP Server for lt-open-data-sdk
 *
 * Exposes Lithuanian Open Data as tools for AI agents (Claude, Cursor, etc.)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDataTools } from './tools/dataTools.js';
import { registerMetadataTools } from './tools/metadataTools.js';
import { registerCodegenTools } from './tools/codegenTools.js';

/**
 * Create and configure the MCP server with all tools
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'lt-open-data',
    version: '1.0.0',
  });

  // Register all tool groups
  registerDataTools(server);
  registerMetadataTools(server);
  registerCodegenTools(server);

  return server;
}

/**
 * Start the MCP server with stdio transport
 * Used when running via CLI: npx lt-open-data-sdk --mcp
 */
export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
