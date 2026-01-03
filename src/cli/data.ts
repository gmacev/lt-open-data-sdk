#!/usr/bin/env node
/**
 * lt-data CLI - Query Lithuanian Open Data from the command line
 *
 * Usage:
 *   lt-data <command> [options]
 *
 * Commands:
 *   query <model>      Query data from a dataset
 *   list [namespace]   List namespaces and models
 *   search <keyword>   Search for datasets
 *   describe <model>   Show model schema
 *   count <model>      Count records
 *   get <model> <id>   Get single record by ID
 *   types <namespace>  Generate TypeScript types
 *   mcp                Start MCP server
 */

import { runQuery } from './commands/query.js';
import { runList } from './commands/list.js';
import { runSearch } from './commands/search.js';
import { runDescribe } from './commands/describe.js';
import { runCount } from './commands/count.js';
import { runGet } from './commands/get.js';
import { createColors, shouldEnableColors } from './ui/colors.js';
import { ExitCode, isCliError, getExitCode } from './utils/errors.js';
import { crawlNamespace, fetchAllModelsMetadata } from './crawler.js';
import { generateDeclarationFile } from './generator.js';
import { modelPathToInterfaceName } from './typeMapper.js';
import { startMcpServer } from '../mcp/server.js';
import { SpintaClient } from '../client/SpintaClient.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

interface GlobalOptions {
  baseUrl: string;
  format: 'json' | 'csv' | 'ndjson';
  output?: string;
  quiet: boolean;
  noColor: boolean;
  noRetry: boolean;
  help: boolean;
}

interface ParsedArgs {
  command: string;
  positional: string[];
  options: GlobalOptions;
  filters: string[];
  select?: string;
  sort?: string;
  limit: number;
  stream: boolean;
  namespace?: string;
}

const DEFAULT_BASE_URL = 'https://get.data.gov.lt';


function parseArgs(args: readonly string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: '',
    positional: [],
    options: {
      baseUrl: DEFAULT_BASE_URL,
      format: 'json',
      output: undefined,
      quiet: false,
      noColor: false,
      noRetry: false,
      help: false,
    },
    filters: [],
    limit: -1,
    stream: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i] ?? '';
    const nextArg = args[i + 1];

    if (arg === '--help' || arg === '-h') {
      result.options.help = true;
    } else if (arg === '--quiet' || arg === '-q') {
      result.options.quiet = true;
    } else if (arg === '--no-color') {
      result.options.noColor = true;
    } else if (arg === '--no-retry') {
      result.options.noRetry = true;
    } else if (arg === '--mcp') {
      result.command = 'mcp';
    } else if (arg === '--stream') {
      result.stream = true;
    } else if (arg === '--base-url' && nextArg !== undefined) {
      result.options.baseUrl = nextArg;
      i++;
    } else if ((arg === '--format' || arg === '-f') && nextArg !== undefined) {
      if (nextArg === 'json' || nextArg === 'csv' || nextArg === 'ndjson') {
        result.options.format = nextArg;
      }
      i++;
    } else if ((arg === '--output' || arg === '-o') && nextArg !== undefined) {
      result.options.output = nextArg;
      i++;
    } else if ((arg === '--filter' || arg === '-w') && nextArg !== undefined) {
      result.filters.push(nextArg);
      i++;
    } else if ((arg === '--select' || arg === '-s') && nextArg !== undefined) {
      result.select = nextArg;
      i++;
    } else if (arg === '--sort' && nextArg !== undefined) {
      result.sort = nextArg;
      i++;
    } else if ((arg === '--limit' || arg === '-l') && nextArg !== undefined) {
      result.limit = parseInt(nextArg, 10);
      i++;
    } else if (arg === '--namespace' && nextArg !== undefined) {
      result.namespace = nextArg;
      i++;
    } else if (!arg.startsWith('-')) {
      if (result.command === '') {
        result.command = arg;
      } else {
        result.positional.push(arg);
      }
    }
    i++;
  }

  return result;
}

function showHelp(): void {
  console.log(`
lt-data - Query Lithuanian Open Data from the command line

Usage:
  lt-data <command> [options]

Commands:
  query <model>      Query data from a dataset
  list [namespace]   List namespaces and models
  search <keyword>   Search for datasets
  describe <model>   Show model schema
  count <model>      Count records
  get <model> <id>   Get single record by ID
  types <namespace>  Generate TypeScript types
  mcp                Start MCP server

Query Options:
  --filter, -w       Filter expression (repeatable)
  --select, -s       Fields to select (comma-separated)
  --sort             Sort field (prefix with - for desc)
  --limit, -l        Max records (default: 100)
  --stream           Fetch all records with pagination

Global Options:
  --format, -f       Output format: json, csv, ndjson (default: json)
  --output, -o       Output file (default: stdout)
  --base-url         API base URL (default: https://get.data.gov.lt)
  --no-color         Disable colored output
  --quiet, -q        Suppress progress output
  --no-retry         Fail fast on rate limits (no backoff)
  --help, -h         Show this help message

Examples:
  lt-data query datasets/gov/vmi/ja_mokesciai/Moketojas --filter "metai=2025" --limit 10
  lt-data list datasets/gov/rc
  lt-data search receptai
  lt-data describe datasets/gov/rc/espbiis/receptai_2024/Receptas
  lt-data count datasets/gov/rc/jar/iregistruoti/JuridinisAsmuo --filter "reg_data>=2025-01-01"
`);
}

async function runTypes(namespace: string, options: GlobalOptions): Promise<void> {
  const colors = createColors(shouldEnableColors(options.noColor));

  if (namespace === '') {
    console.error(colors.error('✗') + ' Missing namespace argument');
    console.error('  Usage: lt-data types <namespace>');
    process.exit(ExitCode.UserError);
  }

  console.error(`🔍 Discovering models in ${namespace}...`);

  const client = new SpintaClient({ baseUrl: options.baseUrl });
  const modelPaths = await crawlNamespace(client, namespace);

  if (modelPaths.length === 0) {
    console.error(`⚠️  No models found in namespace: ${namespace}`);
    process.exit(ExitCode.UserError);
  }

  console.error(`📦 Found ${String(modelPaths.length)} model(s):`);
  for (const path of modelPaths) {
    console.error(`   - ${modelPathToInterfaceName(path)} (${path})`);
  }

  console.error(`\n📥 Fetching model metadata...`);
  const metadata = await fetchAllModelsMetadata(client, modelPaths);

  console.error(`\n📝 Generating TypeScript definitions...`);
  const output = generateDeclarationFile(metadata, namespace);

  if (options.output !== undefined) {
    mkdirSync(dirname(options.output), { recursive: true });
    writeFileSync(options.output, output, 'utf-8');
    console.error(`\n✅ Written to ${options.output}`);
  } else {
    console.log(output);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.options.help || parsed.command === '') {
    showHelp();
    process.exit(parsed.options.help ? ExitCode.Success : ExitCode.UserError);
  }

  const colors = createColors(shouldEnableColors(parsed.options.noColor));

  try {
    switch (parsed.command) {
      case 'query':
        await runQuery({
          model: parsed.positional[0] ?? '',
          filters: parsed.filters,
          select: parsed.select,
          sort: parsed.sort,
          limit: parsed.limit,
          stream: parsed.stream,
          format: parsed.options.format,
          output: parsed.options.output,
          quiet: parsed.options.quiet,
          noRetry: parsed.options.noRetry,
          baseUrl: parsed.options.baseUrl,
          colors,
        });
        break;

      case 'list':
        await runList({
          namespace: parsed.positional[0] ?? '',
          format: parsed.options.format,
          output: parsed.options.output,
          quiet: parsed.options.quiet,
          baseUrl: parsed.options.baseUrl,
          colors,
        });
        break;

      case 'search':
        await runSearch({
          query: parsed.positional[0] ?? '',
          namespace: parsed.namespace ?? 'datasets/gov',
          limit: parsed.limit,
          format: parsed.options.format,
          output: parsed.options.output,
          quiet: parsed.options.quiet,
          baseUrl: parsed.options.baseUrl,
          colors,
        });
        break;

      case 'describe':
        await runDescribe({
          model: parsed.positional[0] ?? '',
          format: parsed.options.format,
          output: parsed.options.output,
          quiet: parsed.options.quiet,
          baseUrl: parsed.options.baseUrl,
          colors,
        });
        break;

      case 'count':
        await runCount({
          model: parsed.positional[0] ?? '',
          filters: parsed.filters,
          format: parsed.options.format,
          output: parsed.options.output,
          quiet: parsed.options.quiet,
          baseUrl: parsed.options.baseUrl,
          colors,
        });
        break;

      case 'get':
        await runGet({
          model: parsed.positional[0] ?? '',
          id: parsed.positional[1] ?? '',
          format: parsed.options.format,
          output: parsed.options.output,
          quiet: parsed.options.quiet,
          baseUrl: parsed.options.baseUrl,
          colors,
        });
        break;

      case 'types':
        await runTypes(parsed.positional[0] ?? '', parsed.options);
        break;

      case 'mcp':
        console.error('🚀 Starting MCP server...');
        await startMcpServer();
        break;

      default:
        console.error(colors.error('✗') + ` Unknown command: ${parsed.command}`);
        showHelp();
        process.exit(ExitCode.UserError);
    }
  } catch (error) {
    const exitCode = getExitCode(error);
    const message = isCliError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);

    console.error(colors.error('✗') + ` ${message}`);

    if (isCliError(error) && error.hint !== undefined) {
      console.error(colors.dim(`  ${error.hint}`));
    }

    process.exit(exitCode);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(ExitCode.InternalError);
});
