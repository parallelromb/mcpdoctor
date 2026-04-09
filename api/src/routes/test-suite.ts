import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { runTestSuite } from '../mcp/runner.js';
import type { ServerConfig } from '../mcp/client.js';

export async function testSuiteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  // POST /v1/servers/:id/test — trigger test run
  app.post<{ Params: { id: string } }>(
    '/v1/servers/:id/test',
    async (request, reply) => {
      const { rows: serverRows } = await pool.query(
        'SELECT id, name, transport, command, args, url, env FROM servers WHERE id = $1 AND tenant_id = $2',
        [request.params.id, request.tenantId],
      );
      if (serverRows.length === 0) return reply.code(404).send({ error: 'Server not found' });

      const server = serverRows[0];

      // Create test run record
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO test_runs (tenant_id, server_id, status)
         VALUES ($1, $2, 'running')
         RETURNING id`,
        [request.tenantId, server.id],
      );
      const testRunId = rows[0].id;

      // Parse env and args from JSONB
      const serverConfig: ServerConfig = {
        id: server.id as string,
        name: server.name as string,
        transport: server.transport as 'stdio' | 'sse' | 'streamable-http',
        command: server.command as string | undefined,
        args: (server.args as string[] | undefined) ?? [],
        url: server.url as string | undefined,
        env: (server.env as Record<string, string> | undefined) ?? {},
      };

      // Run test asynchronously
      runTestSuite(testRunId, serverConfig).catch((err) => {
        console.error(`[test-run:${testRunId}] Fatal error:`, err);
        pool.query(
          `UPDATE test_runs SET status = 'error', completed_at = NOW(), summary = $1 WHERE id = $2`,
          [`Fatal: ${String(err)}`, testRunId],
        ).catch(() => {/* non-critical */});
      });

      return reply.code(202).send({
        test_run_id: testRunId,
        status: 'running',
        message: 'Test suite started. Poll GET /v1/test-runs/:id for results.',
      });
    },
  );

  // Also support the old /v1/tests endpoint for backwards compat
  app.post<{ Body: { server_id: string } }>(
    '/v1/tests',
    {
      schema: {
        body: {
          type: 'object',
          required: ['server_id'],
          properties: { server_id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { server_id } = request.body;
      const { rows: serverRows } = await pool.query(
        'SELECT id, name, transport, command, args, url, env FROM servers WHERE id = $1 AND tenant_id = $2',
        [server_id, request.tenantId],
      );
      if (serverRows.length === 0) return reply.code(404).send({ error: 'Server not found' });

      const server = serverRows[0];
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO test_runs (tenant_id, server_id, status) VALUES ($1, $2, 'running') RETURNING id`,
        [request.tenantId, server.id],
      );
      const testRunId = rows[0].id;

      const serverConfig: ServerConfig = {
        id: server.id as string,
        name: server.name as string,
        transport: server.transport as 'stdio' | 'sse' | 'streamable-http',
        command: server.command as string | undefined,
        args: (server.args as string[] | undefined) ?? [],
        url: server.url as string | undefined,
        env: (server.env as Record<string, string> | undefined) ?? {},
      };

      runTestSuite(testRunId, serverConfig).catch((err) => {
        console.error(`[test-run:${testRunId}] Fatal error:`, err);
        pool.query(
          `UPDATE test_runs SET status = 'error', completed_at = NOW(), summary = $1 WHERE id = $2`,
          [`Fatal: ${String(err)}`, testRunId],
        ).catch(() => {});
      });

      return reply.code(202).send({ test_run_id: testRunId, status: 'running' });
    },
  );

  // GET /v1/test-runs/:id — get test run results
  app.get<{ Params: { id: string } }>('/v1/test-runs/:id', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT id, server_id, status, score, grade, total_checks, passed, failed, skipped,
              duration_ms, results, summary, created_at, completed_at
       FROM test_runs WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, request.tenantId],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Test run not found' });
    return reply.send({ test_run: rows[0] });
  });

  // GET /v1/servers/:id/test-runs — list test runs for a server
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/v1/servers/:id/test-runs', async (request, reply) => {
    const limit = Math.min(Number(request.query.limit) || 20, 100);
    const { rows } = await pool.query(
      `SELECT id, status, score, grade, total_checks, passed, failed, skipped,
              duration_ms, summary, created_at, completed_at
       FROM test_runs WHERE server_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT $3`,
      [request.params.id, request.tenantId, limit],
    );
    return reply.send({ test_runs: rows });
  });

  // GET /v1/test-runs/:id/checks — get individual check results for a run
  app.get<{ Params: { id: string } }>('/v1/test-runs/:id/checks', async (request, reply) => {
    // Verify the test run belongs to the tenant
    const { rows: runRows } = await pool.query(
      'SELECT id FROM test_runs WHERE id = $1 AND tenant_id = $2',
      [request.params.id, request.tenantId],
    );
    if (runRows.length === 0) return reply.code(404).send({ error: 'Test run not found' });

    const { rows } = await pool.query(
      `SELECT check_id, category, name, status, duration_ms, message, details
       FROM check_results WHERE test_run_id = $1
       ORDER BY created_at ASC`,
      [request.params.id],
    );
    return reply.send({ checks: rows });
  });

  // GET /v1/tests — list all test runs (old endpoint compat)
  app.get<{ Querystring: { server_id?: string; limit?: string } }>(
    '/v1/tests',
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit) || 20, 100);
      const serverId = request.query.server_id;
      let query: string;
      let params: unknown[];
      if (serverId) {
        query = `SELECT id, server_id, status, score, grade, total_checks, passed, failed, skipped,
                        duration_ms, summary, created_at, completed_at
                 FROM test_runs WHERE tenant_id = $1 AND server_id = $2
                 ORDER BY created_at DESC LIMIT $3`;
        params = [request.tenantId, serverId, limit];
      } else {
        query = `SELECT id, server_id, status, score, grade, total_checks, passed, failed, skipped,
                        duration_ms, summary, created_at, completed_at
                 FROM test_runs WHERE tenant_id = $1
                 ORDER BY created_at DESC LIMIT $2`;
        params = [request.tenantId, limit];
      }
      const { rows } = await pool.query(query, params);
      return reply.send({ test_runs: rows });
    },
  );

  // GET /v1/tests/:id — old endpoint compat
  app.get<{ Params: { id: string } }>('/v1/tests/:id', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT id, server_id, status, score, grade, total_checks, passed, failed, skipped,
              duration_ms, results, summary, created_at, completed_at
       FROM test_runs WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, request.tenantId],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Test run not found' });
    return reply.send({ test_run: rows[0] });
  });
}
