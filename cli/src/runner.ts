/**
 * Standalone Test Runner — no database dependencies.
 *
 * Connects to an MCP server, runs all compliance checks, collects results
 * in memory, and returns structured output.
 */

import { McpClient } from './client.js';
import type { ServerConfig } from './client.js';
import { complianceChecks, calculateScore } from './spec.js';
import type { CheckResult, ComplianceCheck } from './spec.js';

export interface CheckRecord {
  check_id: string;
  name: string;
  category: string;
  severity: string;
  status: string;
  duration_ms: number;
  message: string;
  details?: unknown;
}

export interface TestRunResult {
  server: { name: string; version: string } | null;
  transport: string;
  protocolVersion: string | null;
  score: number;
  grade: string;
  passed: number;
  failed: number;
  skipped: number;
  errors: number;
  total: number;
  duration_ms: number;
  checks: CheckRecord[];
}

export interface RunOptions {
  /** Only run checks in this category */
  category?: string;
  /** Per-check timeout override in ms */
  timeout?: number;
  /** Called after successful connection with server info */
  onConnected?: (serverName: string, serverVersion: string, protocolVersion: string | null) => void;
  /** Called after each check completes (for live output) */
  onCheckComplete?: (check: ComplianceCheck, result: CheckResult, index: number, total: number) => void;
}

export async function runTestSuite(
  serverConfig: ServerConfig,
  options: RunOptions = {},
): Promise<TestRunResult> {
  const client = new McpClient(serverConfig);
  const results: CheckRecord[] = [];
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let erroredCount = 0;

  const overallStart = Date.now();

  // Filter checks by category if specified
  const checksToRun = options.category
    ? complianceChecks.filter(c => c.category === options.category)
    : complianceChecks;

  try {
    // Connect and perform initialize handshake
    await client.connect();

    // Notify listener of successful connection
    if (options.onConnected && client.serverInfo) {
      options.onConnected(
        client.serverInfo.name,
        client.serverInfo.version,
        client.initResult?.protocolVersion ?? null,
      );
    }

    // Run all checks in order
    for (let i = 0; i < checksToRun.length; i++) {
      const check = checksToRun[i];
      let result: CheckResult;
      const checkStart = Date.now();

      try {
        result = await check.run(client);
        // Ensure duration_ms is populated
        if (!result.duration_ms) {
          result.duration_ms = Date.now() - checkStart;
        }
      } catch (err) {
        result = {
          status: 'error',
          duration_ms: Date.now() - checkStart,
          message: `Check threw an unexpected error: ${String(err)}`,
          details: { error: String(err) },
        };
      }

      results.push({
        check_id: check.id,
        name: check.name,
        category: check.category,
        severity: check.severity,
        status: result.status,
        duration_ms: result.duration_ms,
        message: result.message,
        details: result.details,
      });

      switch (result.status) {
        case 'passed': passedCount++; break;
        case 'failed': failedCount++; break;
        case 'skipped': skippedCount++; break;
        case 'error': erroredCount++; break;
      }

      // Notify listener
      if (options.onCheckComplete) {
        options.onCheckComplete(check, result, i, checksToRun.length);
      }

      // If server disconnected mid-test, mark remaining as error
      if (!client.isConnected && results.length < checksToRun.length) {
        for (const remaining of checksToRun.slice(results.length)) {
          const errorRecord: CheckRecord = {
            check_id: remaining.id,
            name: remaining.name,
            category: remaining.category,
            severity: remaining.severity,
            status: 'error',
            duration_ms: 0,
            message: 'Server disconnected during test run',
          };
          results.push(errorRecord);
          erroredCount++;

          if (options.onCheckComplete) {
            options.onCheckComplete(remaining, {
              status: 'error',
              duration_ms: 0,
              message: 'Server disconnected during test run',
            }, results.length - 1, checksToRun.length);
          }
        }
        break;
      }
    }

    const duration_ms = Date.now() - overallStart;
    const { score, grade } = calculateScore(results);

    return {
      server: client.serverInfo ? { name: client.serverInfo.name, version: client.serverInfo.version } : null,
      transport: serverConfig.transport,
      protocolVersion: client.initResult?.protocolVersion ?? null,
      score,
      grade,
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
      errors: erroredCount,
      total: results.length,
      duration_ms,
      checks: results,
    };
  } catch (err) {
    const duration_ms = Date.now() - overallStart;

    // Connection failed entirely — return error result
    return {
      server: null,
      transport: serverConfig.transport,
      protocolVersion: null,
      score: 0,
      grade: 'F',
      passed: 0,
      failed: 0,
      skipped: 0,
      errors: 1,
      total: 0,
      duration_ms,
      checks: [{
        check_id: 'connection',
        name: 'Server Connection',
        category: 'protocol',
        severity: 'critical',
        status: 'error',
        duration_ms,
        message: `Failed to connect: ${String(err)}`,
        details: { error: String(err) },
      }],
    };
  } finally {
    await client.disconnect();
  }
}
