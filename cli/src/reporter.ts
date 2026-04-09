/**
 * Terminal Output Reporter
 *
 * Formats test results for terminal display with ANSI colors,
 * JSON output, and GitHub-flavored markdown.
 */

import type { TestRunResult, CheckRecord } from './runner.js';

// ANSI color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const STATUS_ICONS: Record<string, string> = {
  passed: `${c.green}\u2713${c.reset}`,
  failed: `${c.red}\u2717${c.reset}`,
  skipped: `${c.yellow}\u25CB${c.reset}`,
  error: `${c.red}\u2718${c.reset}`,
};

const CATEGORY_LABELS: Record<string, string> = {
  protocol: 'PROTOCOL',
  tools: 'TOOLS',
  resources: 'RESOURCES',
  prompts: 'PROMPTS',
  error_handling: 'ERROR HANDLING',
  security: 'SECURITY',
};

const GRADE_COLORS: Record<string, string> = {
  A: c.green,
  B: c.blue,
  C: c.yellow,
  D: c.yellow,
  F: c.red,
};

function pad(str: string, len: number): string {
  // Strip ANSI codes for length calculation
  const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = len - plain.length;
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ---- Pretty (terminal) output ----

export function formatPretty(result: TestRunResult, verbose: boolean = false): string {
  const lines: string[] = [];
  const width = 50;
  const rule = '\u2500'.repeat(width);

  // Header
  lines.push('');
  lines.push(`  ${c.bold}${c.cyan}MCP Doctor${c.reset} ${c.dim}v1.0.0${c.reset} ${c.dim}\u2014 Compliance Test Suite${c.reset}`);
  lines.push(`  ${c.dim}${rule}${c.reset}`);
  lines.push('');

  // Server info
  if (result.server) {
    lines.push(`  ${c.dim}Server:${c.reset}    ${c.bold}${result.server.name}${c.reset} ${c.dim}v${result.server.version}${c.reset}`);
  } else {
    lines.push(`  ${c.dim}Server:${c.reset}    ${c.red}(connection failed)${c.reset}`);
  }
  lines.push(`  ${c.dim}Transport:${c.reset} ${result.transport}`);
  if (result.protocolVersion) {
    lines.push(`  ${c.dim}Protocol:${c.reset}  ${result.protocolVersion}`);
  }
  lines.push('');

  // Group checks by category
  const categories = new Map<string, CheckRecord[]>();
  for (const check of result.checks) {
    const cat = check.category;
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(check);
  }

  for (const [category, checks] of categories) {
    const label = CATEGORY_LABELS[category] ?? category.toUpperCase();
    lines.push(`  ${c.bold}${c.white}${label}${c.reset}`);

    for (const check of checks) {
      const icon = STATUS_ICONS[check.status] ?? '?';
      const name = pad(`${check.name}`, 48);
      const duration = `${c.dim}${formatDuration(check.duration_ms).padStart(6)}${c.reset}`;
      lines.push(`  ${icon} ${name} ${duration}`);

      if (verbose && check.status === 'failed') {
        lines.push(`    ${c.dim}${c.red}${check.message}${c.reset}`);
      }
      if (verbose && check.status === 'error') {
        lines.push(`    ${c.dim}${c.red}${check.message}${c.reset}`);
      }
      if (verbose && check.status === 'skipped') {
        lines.push(`    ${c.dim}${check.message}${c.reset}`);
      }
    }
    lines.push('');
  }

  // Summary
  lines.push(`  ${c.dim}${rule}${c.reset}`);

  const gradeColor = GRADE_COLORS[result.grade] ?? c.white;
  lines.push(`  ${c.bold}Score: ${gradeColor}${result.score}/100 (${result.grade})${c.reset}`);
  lines.push('');

  const parts: string[] = [];
  if (result.passed > 0) parts.push(`${c.green}${result.passed} passed${c.reset}`);
  if (result.failed > 0) parts.push(`${c.red}${result.failed} failed${c.reset}`);
  if (result.skipped > 0) parts.push(`${c.yellow}${result.skipped} skipped${c.reset}`);
  if (result.errors > 0) parts.push(`${c.red}${result.errors} errors${c.reset}`);
  lines.push(`  ${parts.join(`${c.dim} \u00B7 ${c.reset}`)}`);

  lines.push(`  ${c.dim}Total time: ${formatDuration(result.duration_ms)}${c.reset}`);
  lines.push('');

  return lines.join('\n');
}

// ---- Live check output (called during test run) ----

export function printCheckResult(
  check: { name: string; category: string },
  status: string,
  duration_ms: number,
  message: string,
  verbose: boolean,
): void {
  const icon = STATUS_ICONS[status] ?? '?';
  const name = pad(`${check.name}`, 48);
  const duration = `${c.dim}${formatDuration(duration_ms).padStart(6)}${c.reset}`;
  process.stdout.write(`  ${icon} ${name} ${duration}\n`);

  if (verbose && (status === 'failed' || status === 'error')) {
    process.stdout.write(`    ${c.dim}${c.red}${message}${c.reset}\n`);
  }
  if (verbose && status === 'skipped') {
    process.stdout.write(`    ${c.dim}${message}${c.reset}\n`);
  }
}

export function printCategoryHeader(category: string): void {
  const label = CATEGORY_LABELS[category] ?? category.toUpperCase();
  process.stdout.write(`\n  ${c.bold}${c.white}${label}${c.reset}\n`);
}

export function printHeader(transport: string): void {
  const width = 50;
  const rule = '\u2500'.repeat(width);
  process.stdout.write('\n');
  process.stdout.write(`  ${c.bold}${c.cyan}MCP Doctor${c.reset} ${c.dim}v1.0.0${c.reset} ${c.dim}\u2014 Compliance Test Suite${c.reset}\n`);
  process.stdout.write(`  ${c.dim}${rule}${c.reset}\n`);
  process.stdout.write('\n');
  process.stdout.write(`  ${c.dim}Transport:${c.reset} ${transport}\n`);
  process.stdout.write(`  ${c.dim}Connecting...${c.reset}\n`);
}

export function printConnected(serverName: string, serverVersion: string, protocolVersion: string | null): void {
  // Replace "Connecting..." line with server info
  process.stdout.write('\x1b[1A\x1b[2K');
  process.stdout.write(`  ${c.dim}Server:${c.reset}    ${c.bold}${serverName}${c.reset} ${c.dim}v${serverVersion}${c.reset}\n`);
  if (protocolVersion) {
    process.stdout.write(`  ${c.dim}Protocol:${c.reset}  ${protocolVersion}\n`);
  }
}

export function printConnectionFailed(error: string): void {
  process.stdout.write('\x1b[1A\x1b[2K');
  process.stdout.write(`  ${c.red}Connection failed: ${error}${c.reset}\n`);
}

export function printSummary(result: TestRunResult): void {
  const width = 50;
  const rule = '\u2500'.repeat(width);

  process.stdout.write(`\n  ${c.dim}${rule}${c.reset}\n`);

  const gradeColor = GRADE_COLORS[result.grade] ?? c.white;
  process.stdout.write(`  ${c.bold}Score: ${gradeColor}${result.score}/100 (${result.grade})${c.reset}\n`);
  process.stdout.write('\n');

  const parts: string[] = [];
  if (result.passed > 0) parts.push(`${c.green}${result.passed} passed${c.reset}`);
  if (result.failed > 0) parts.push(`${c.red}${result.failed} failed${c.reset}`);
  if (result.skipped > 0) parts.push(`${c.yellow}${result.skipped} skipped${c.reset}`);
  if (result.errors > 0) parts.push(`${c.red}${result.errors} errors${c.reset}`);
  process.stdout.write(`  ${parts.join(`${c.dim} \u00B7 ${c.reset}`)}\n`);
  process.stdout.write(`  ${c.dim}Total time: ${formatDuration(result.duration_ms)}${c.reset}\n\n`);
}

// ---- JSON output ----

export function formatJson(result: TestRunResult): string {
  return JSON.stringify({
    version: '1.0.0',
    server: result.server,
    transport: result.transport,
    protocolVersion: result.protocolVersion,
    score: result.score,
    grade: result.grade,
    passed: result.passed,
    failed: result.failed,
    skipped: result.skipped,
    errors: result.errors,
    total: result.total,
    duration_ms: result.duration_ms,
    checks: result.checks,
  }, null, 2);
}

// ---- Markdown output ----

export function formatMarkdown(result: TestRunResult): string {
  const lines: string[] = [];

  lines.push(`# MCP Doctor Compliance Report`);
  lines.push('');

  // Badge-style summary
  const badgeColor = result.grade === 'A' ? 'brightgreen' : result.grade === 'B' ? 'green' : result.grade === 'C' ? 'yellow' : result.grade === 'D' ? 'orange' : 'red';
  lines.push(`![Score](https://img.shields.io/badge/MCP%20Doctor-${result.score}%2F100%20(${result.grade})-${badgeColor})`);
  lines.push('');

  // Server info
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  if (result.server) {
    lines.push(`| Server | ${result.server.name} v${result.server.version} |`);
  }
  lines.push(`| Transport | ${result.transport} |`);
  if (result.protocolVersion) {
    lines.push(`| Protocol | ${result.protocolVersion} |`);
  }
  lines.push(`| Score | **${result.score}/100 (${result.grade})** |`);
  lines.push(`| Duration | ${formatDuration(result.duration_ms)} |`);
  lines.push('');

  // Summary counts
  lines.push(`**${result.passed}** passed · **${result.failed}** failed · **${result.skipped}** skipped · **${result.errors}** errors`);
  lines.push('');

  // Group by category
  const categories = new Map<string, CheckRecord[]>();
  for (const check of result.checks) {
    if (!categories.has(check.category)) categories.set(check.category, []);
    categories.get(check.category)!.push(check);
  }

  for (const [category, checks] of categories) {
    const label = CATEGORY_LABELS[category] ?? category.toUpperCase();
    lines.push(`## ${label}`);
    lines.push('');
    lines.push(`| Status | Check | Duration | Message |`);
    lines.push(`|--------|-------|----------|---------|`);

    for (const check of checks) {
      const icon = check.status === 'passed' ? ':white_check_mark:' : check.status === 'failed' ? ':x:' : check.status === 'skipped' ? ':yellow_circle:' : ':exclamation:';
      const msg = check.message.replace(/\|/g, '\\|');
      lines.push(`| ${icon} | ${check.name} | ${formatDuration(check.duration_ms)} | ${msg} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(`*Generated by [MCP Doctor](https://mcpdoctor.ai) v1.0.0*`);
  lines.push('');

  return lines.join('\n');
}
