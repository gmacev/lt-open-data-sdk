#!/usr/bin/env node
/**
 * lt-gen CLI - Generate TypeScript definitions from Spinta API metadata
 *
 * Usage:
 *   npx lt-gen <namespace> [options]
 *
 * Examples:
 *   npx lt-gen datasets/gov/ivpk/adk
 *   npx lt-gen datasets/gov/ivpk/adk --output ./types/adk.d.ts
 *   npx lt-gen datasets/gov/ivpk/adk --base-url https://get.data.gov.lt
 *
 * Options:
 *   --output, -o   Output file path (default: stdout)
 *   --base-url     Base URL for the API (default: https://get.data.gov.lt)
 *   --help, -h     Show help
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { SpintaClient } from '../client/SpintaClient.js';
import { crawlNamespace, fetchAllModelsMetadata } from './crawler.js';
import { generateDeclarationFile } from './generator.js';
import { modelPathToInterfaceName } from './typeMapper.js';

interface CliOptions {
  namespace: string;
  output: string | undefined;
  baseUrl: string;
  help: boolean;
}

function parseArgs(args: readonly string[]): CliOptions {
  const options: CliOptions = {
    namespace: '',
    output: undefined,
    baseUrl: 'https://get.data.gov.lt',
    help: false,
  };

  let skipNext = false;

  for (const [index, arg] of args.entries()) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--output' || arg === '-o') {
      const nextArg = args[index + 1];
      if (nextArg !== undefined) {
        options.output = nextArg;
        skipNext = true;
      }
    } else if (arg === '--base-url') {
      const nextArg = args[index + 1];
      if (nextArg !== undefined) {
        options.baseUrl = nextArg;
        skipNext = true;
      }
    } else if (!arg.startsWith('-') && options.namespace === '') {
      options.namespace = arg;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
lt-gen - Generate TypeScript definitions from Spinta API metadata

Usage:
  lt-gen <namespace> [options]

Arguments:
  namespace        Namespace path to generate types for (e.g., datasets/gov/ivpk/adk)

Options:
  --output, -o     Output file path (default: stdout)
  --base-url       Base URL for the API (default: https://get.data.gov.lt)
  --help, -h       Show this help message

Examples:
  lt-gen datasets/gov/ivpk/adk
  lt-gen datasets/gov/ivpk/adk -o ./types/adk.d.ts
  lt-gen datasets/gov/ivpk/adk --base-url https://get-test.data.gov.lt
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help || options.namespace === '') {
    showHelp();
    process.exit(options.help ? 0 : 1);
  }

  console.error(`🔍 Discovering models in ${options.namespace}...`);

  const client = new SpintaClient({ baseUrl: options.baseUrl });

  try {
    // Crawl namespace to find all models
    const modelPaths = await crawlNamespace(client, options.namespace);

    if (modelPaths.length === 0) {
      console.error(`⚠️  No models found in namespace: ${options.namespace}`);
      process.exit(1);
    }

    console.error(`📦 Found ${String(modelPaths.length)} model(s):`);
    for (const path of modelPaths) {
      console.error(`   - ${modelPathToInterfaceName(path)} (${path})`);
    }

    // Fetch metadata for all models
    console.error(`\n📥 Fetching model metadata...`);
    const metadata = await fetchAllModelsMetadata(client, modelPaths);

    // Generate declaration file
    console.error(`\n📝 Generating TypeScript definitions...`);
    const output = generateDeclarationFile(metadata, options.namespace);

    // Write output
    if (options.output !== undefined) {
      // Ensure directory exists
      mkdirSync(dirname(options.output), { recursive: true });
      writeFileSync(options.output, output, 'utf-8');
      console.error(`\n✅ Written to ${options.output}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Error: ${errorMessage}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(errorMessage);
});
