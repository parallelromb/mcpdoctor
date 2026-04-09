import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

export async function serverRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  // POST /v1/servers — register a server
  app.post<{
    Body: {
      name: string;
      transport: 'stdio' | 'sse' | 'streamable-http';
      command?: string;
      args?: string[];
      url?: string;
      env?: Record<string, string>;
    };
  }>(
    '/v1/servers',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'transport'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            transport: { type: 'string', enum: ['stdio', 'sse', 'streamable-http'] },
            command: { type: 'string' },
            args: { type: 'array', items: { type: 'string' } },
            url: { type: 'string' },
            env: { type: 'object', additionalProperties: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, transport, command, args, url, env } = request.body;

      if (transport === 'stdio' && !command) {
        return reply.code(400).send({ error: 'command is required for stdio transport' });
      }
      if ((transport === 'sse' || transport === 'streamable-http') && !url) {
        return reply.code(400).send({ error: 'url is required for sse/streamable-http transport' });
      }

      const { rows: countRows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM servers WHERE tenant_id = $1',
        [request.tenantId],
      );
      if (Number(countRows[0].count) >= request.tenantServerLimit) {
        return reply.code(403).send({
          error: 'server_limit_reached',
          message: `Your ${request.tenantPlan} plan allows ${request.tenantServerLimit} server(s). Upgrade to add more.`,
          upgrade_url: 'https://mcpdoctor.dev/pricing',
        });
      }

      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO servers (tenant_id, name, transport, command, args, url, env)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          request.tenantId, name, transport,
          command ?? null,
          JSON.stringify(args ?? []),
          url ?? null,
          JSON.stringify(env ?? {}),
        ],
      );

      return reply.code(201).send({ id: rows[0].id, name, transport });
    },
  );

  // GET /v1/servers — list servers
  app.get('/v1/servers', async (request, reply) => {
    const { rows } = await pool.query(
      `SELECT id, name, transport, command, args, url, status, last_tested_at, last_score, created_at
       FROM servers WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [request.tenantId],
    );
    return reply.send({ servers: rows });
  });

  // GET /v1/servers/:id — server details + last 5 test runs
  app.get<{ Params: { id: string } }>('/v1/servers/:id', async (request, reply) => {
    const { rows: serverRows } = await pool.query(
      `SELECT id, name, transport, command, args, url, env, status, last_tested_at, last_score, created_at
       FROM servers WHERE id = $1 AND tenant_id = $2`,
      [request.params.id, request.tenantId],
    );
    if (serverRows.length === 0) return reply.code(404).send({ error: 'Server not found' });

    const { rows: testRuns } = await pool.query(
      `SELECT id, status, score, grade, total_checks, passed, failed, skipped, duration_ms, summary, created_at, completed_at
       FROM test_runs WHERE server_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 5`,
      [request.params.id, request.tenantId],
    );

    return reply.send({ server: serverRows[0], recent_tests: testRuns });
  });

  // PATCH /v1/servers/:id — update server config
  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      command?: string;
      args?: string[];
      url?: string;
      env?: Record<string, string>;
      status?: string;
    };
  }>('/v1/servers/:id', async (request, reply) => {
    const { name, command, args, url, env, status } = request.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
    if (command !== undefined) { updates.push(`command = $${idx++}`); values.push(command); }
    if (args !== undefined) { updates.push(`args = $${idx++}`); values.push(JSON.stringify(args)); }
    if (url !== undefined) { updates.push(`url = $${idx++}`); values.push(url); }
    if (env !== undefined) { updates.push(`env = $${idx++}`); values.push(JSON.stringify(env)); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }

    if (updates.length === 0) return reply.code(400).send({ error: 'No fields to update' });

    values.push(request.params.id);
    values.push(request.tenantId);

    const { rowCount } = await pool.query(
      `UPDATE servers SET ${updates.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`,
      values,
    );

    if (rowCount === 0) return reply.code(404).send({ error: 'Server not found' });
    return reply.send({ updated: true });
  });

  // DELETE /v1/servers/:id
  app.delete<{ Params: { id: string } }>('/v1/servers/:id', async (request, reply) => {
    const { rowCount } = await pool.query(
      'DELETE FROM servers WHERE id = $1 AND tenant_id = $2',
      [request.params.id, request.tenantId],
    );
    if (rowCount === 0) return reply.code(404).send({ error: 'Server not found' });
    return reply.code(204).send();
  });
}
