/**
 * MCP Doctor CLI — Compliance testing for MCP servers
 *
 * Usage: mcpdoctor test <command> [options]
 */

import { parseArgs } from 'node:util';
import type { ServerConfig } from './client.js';
import { runTestSuite } from './runner.js';
import type { CheckResult, ComplianceCheck } from './spec.js';
import {
  formatJson,
  formatMarkdown,
  printCheckResult,
  printCategoryHeader,
  printHeader,
  printConnected,
  printConnectionFailed,
  printSummary,
} from './reporter.js';

const VERSION = '1.0.0';

const HELP = `
  MCP Doctor v${VERSION} — Compliance testing for MCP servers

  Usage:
    mcpdoctor test <command> [options]

  Arguments:
    command              Server command to test (e.g., "node server.js")

  Options:
    --transport <type>   Transport type: stdio (default), sse, streamable-http
    --url <url>          Server URL (for sse/http transports)
    --env <key=value>    Environment variables (can repeat)
    --timeout <ms>       Per-check timeout in ms (default: 10000)
    --format <type>      Output format: pretty (default), json, markdown
    --category <cat>     Only run checks in this category
    --verbose            Show detailed output for each check
    --version            Show version
    --help               Show help

  Examples:
    mcpdoctor test "node my-server.js"
    mcpdoctor test "npx @company/mcp-server" --verbose
    mcpdoctor test --transport sse --url http://localhost:3001/sse
    mcpdoctor test "node server.js" --format json > report.json
    mcpdoctor test "node server.js" --category protocol
    mcpdoctor test "node server.js" --env API_KEY=abc --env DEBUG=true
`;

function parseEnvArgs(args: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const arg of args) {
    const eqIndex = arg.indexOf('=');
    if (eqIndex === -1) {
      console.error(`Invalid --env format: "${arg}" (expected KEY=VALUE)`);
      process.exit(1);
    }
    env[arg.slice(0, eqIndex)] = arg.slice(eqIndex + 1);
  }
  return env;
}

async function main() {
  // Parse argv manually to handle positional args + repeated --env
  const rawArgs = process.argv.slice(2);

  // Quick checks for --version and --help
  if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }
  if (rawArgs.includes('--help') || rawArgs.includes('-h') || rawArgs.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  // First positional arg should be "test"
  const subcommand = rawArgs[0];
  if (subcommand !== 'test') {
    console.error(`Unknown command: "${subcommand}". Did you mean "mcpdoctor test <command>"?`);
    process.exit(1);
  }

  // Collect --env values before parseArgs (since parseArgs doesn't handle repeated options well)
  const envValues: string[] = [];
  const filteredArgs: string[] = [];
  for (let i = 1; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--env' && i + 1 < rawArgs.length) {
      envValues.push(rawArgs[i + 1]);
      i++; // skip value
    } else {
      filteredArgs.push(rawArgs[i]);
    }
  }

  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: filteredArgs,
      allowPositionals: true,
      options: {
        transport: { type: 'string', default: 'stdio' },
        url: { type: 'string' },
        timeout: { type: 'string', default: '10000' },
        format: { type: 'string', default: 'pretty' },
        category: { type: 'string' },
        verbose: { type: 'boolean', default: false },
      },
    });
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    console.error('Run "mcpdoctor --help" for usage information.');
    process.exit(1);
  }

  const { values, positionals } = parsed;
  const transport = values.transport as 'stdio' | 'sse' | 'streamable-http';
  const url = values.url as string | undefined;
  const timeout = parseInt(values.timeout as string, 10);
  const format = values.format as string;
  const category = values.category as string | undefined;
  const verbose = values.verbose as boolean;

  // The command is all positionals joined (or empty for HTTP transports)
  const command = positionals.join(' ') || undefined;

  if (!command && transport === 'stdio') {
    console.error('Error: A command is required for stdio transport.');
    console.error('Usage: mcpdoctor test "node my-server.js"');
    process.exit(1);
  }

  if ((transport === 'sse' || transport === 'streamable-http') && !url) {
    console.error(`Error: --url is required for ${transport} transport.`);
    process.exit(1);
  }

  const env = parseEnvArgs(envValues);

  const serverConfig: ServerConfig = {
    id: 'cli-test',
    name: command ?? url ?? 'unknown',
    transport,
    command,
    url,
    env: Object.keys(env).length > 0 ? env : undefined,
  };

  // For non-pretty formats, run silently and output at end
  if (format === 'json' || format === 'markdown') {
    const result = await runTestSuite(serverConfig, { category, timeout });

    if (format === 'json') {
      console.log(formatJson(result));
    } else {
      console.log(formatMarkdown(result));
    }

    process.exit(result.failed > 0 || result.errors > 0 ? 1 : 0);
    return;
  }

  // Pretty format — stream output as checks complete
  printHeader(transport);

  let currentCategory = '';
  let connected = false;

  const result = await runTestSuite(serverConfig, {
    category,
    timeout,
    onConnected: (name: string, version: string, proto: string | null) => {
      connected = true;
      printConnected(name, version, proto);
    },
    onCheckComplete: (check: ComplianceCheck, checkResult: CheckResult, _index: number, _total: number) => {
      if (check.category !== currentCategory) {
        currentCategory = check.category;
        printCategoryHeader(currentCategory);
      }
      printCheckResult(
        check,
        checkResult.status,
        checkResult.duration_ms,
        checkResult.message,
        verbose,
      );
    },
  });

  // If connection failed, replace "Connecting..." line
  if (!connected) {
    printConnectionFailed(result.checks[0]?.message ?? 'Unknown error');
  }
  printSummary(result);

  process.exit(result.failed > 0 || result.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`Fatal error: ${String(err)}`);
  process.exit(1);
});
