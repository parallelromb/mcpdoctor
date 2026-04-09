/**
 * Test Runner Orchestrator
 *
 * Connects to an MCP server, runs all compliance checks, scores results,
 * and persists the test run to the database.
 */

import { pool } from '../db/pool.js';
import { McpClient } from './client.js';
import type { ServerConfig } from './client.js';
import { complianceChecks, calculateScore, SEVERITY_WEIGHTS } from './spec.js';
import type { CheckResult } from './spec.js';

export interface TestRunRecord {
  check_id: string;
  name: string;
  category: string;
  severity: string;
  status: string;
  duration_ms: number;
  message: string;
  details?: unknown;
}

export async function runTestSuite(
  testRunId: string,
  serverConfig: ServerConfig,
): Promise<void> {
  const client = new McpClient(serverConfig);
  const results: TestRunRecord[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errored = 0;

  const overallStart = Date.now();

  try {
    // Connect and perform initialize handshake
    await client.connect();

    // Run all checks in order
    for (const check of complianceChecks) {
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
        case 'passed': passed++; break;
        case 'failed': failed++; break;
        case 'skipped': skipped++; break;
        case 'error': errored++; break;
      }

      // If server disconnected mid-test, mark remaining as error
      if (!client.isConnected && results.length < complianceChecks.length) {
        for (const remaining of complianceChecks.slice(results.length)) {
          results.push({
            check_id: remaining.id,
            name: remaining.name,
            category: remaining.category,
            severity: remaining.severity,
            status: 'error',
            duration_ms: 0,
            message: 'Server disconnected during test run',
          });
          errored++;
        }
        break;
      }
    }

    const total = results.length;
    const duration_ms = Date.now() - overallStart;

    // Calculate score
    const { score, grade, earned, total: totalPoints } = calculateScore(results);

    // Determine overall status
    const hasFailures = failed > 0 || errored > 0;
    const status = hasFailures ? 'failed' : 'passed';

    // Generate summary
    const criticalFails = results.filter(r => r.status === 'failed' && r.severity === 'critical');
    const summary = [
      `Score: ${score}/100 (${grade})`,
      `${passed} passed, ${failed} failed, ${skipped} skipped, ${errored} errors`,
      criticalFails.length > 0
        ? `Critical failures: ${criticalFails.map(r => r.name).join(', ')}`
        : 'No critical failures',
    ].join(' | ');

    // Insert individual check_results rows
    for (const r of results) {
      await pool.query(
        `INSERT INTO check_results (test_run_id, check_id, category, name, status, duration_ms, message, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testRunId, r.check_id, r.category, r.name, r.status, r.duration_ms, r.message, JSON.stringify(r.details ?? null)],
      );
    }

    await pool.query(
      `UPDATE test_runs
       SET status = $1, score = $2, grade = $3,
           total_checks = $4, passed = $5, failed = $6, skipped = $7,
           duration_ms = $8, results = $9, summary = $10, completed_at = NOW()
       WHERE id = $11`,
      [
        status, score, grade,
        total, passed, failed, skipped,
        duration_ms, JSON.stringify(results), summary,
        testRunId,
      ],
    );

    // Update server's last_tested_at and last_score
    await pool.query(
      `UPDATE servers SET last_tested_at = NOW(), last_score = $1 WHERE id = $2`,
      [score, serverConfig.id],
    );

    // Record metric
    await pool.query(
      `INSERT INTO metrics (server_id, metric_type, value, metadata)
       VALUES ($1, 'compliance_score', $2, $3)`,
      [serverConfig.id, score, JSON.stringify({ grade, passed, failed, skipped, duration_ms })],
    );
  } catch (err) {
    await pool.query(
      `UPDATE test_runs
       SET status = 'error', completed_at = NOW(),
           results = $1, summary = $2
       WHERE id = $3`,
      [
        JSON.stringify([{ error: String(err) }]),
        `Test run failed: ${String(err)}`,
        testRunId,
      ],
    );
    throw err;
  } finally {
    await client.disconnect();
  }
}
