import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authenticate);

  // GET /v1/servers/:id/metrics — query stored metrics
  app.get<{
    Params: { id: string };
    Querystring: { metric_type?: string; limit?: string; since?: string };
  }>('/v1/servers/:id/metrics', async (request, reply) => {
    // Verify server belongs to tenant
    const { rows: serverRows } = await pool.query(
      'SELECT id FROM servers WHERE id = $1 AND tenant_id = $2',
      [request.params.id, request.tenantId],
    );
    if (serverRows.length === 0) return reply.code(404).send({ error: 'Server not found' });

    const limit = Math.min(Number(request.query.limit) || 100, 1000);
    const metricType = request.query.metric_type ?? 'compliance_score';
    const since = request.query.since ? new Date(request.query.since) : null;

    let query: string;
    let params: unknown[];

    if (since) {
      query = `SELECT metric_type, value, metadata, created_at
               FROM metrics WHERE server_id = $1 AND metric_type = $2 AND created_at >= $3
               ORDER BY created_at DESC LIMIT $4`;
      params = [request.params.id, metricType, since, limit];
    } else {
      query = `SELECT metric_type, value, metadata, created_at
               FROM metrics WHERE server_id = $1 AND metric_type = $2
               ORDER BY created_at DESC LIMIT $3`;
      params = [request.params.id, metricType, limit];
    }

    const { rows } = await pool.query(query, params);

    // Also compute aggregate stats
    const { rows: statsRows } = await pool.query(
      `SELECT
         COUNT(*) as total_runs,
         ROUND(AVG(value)::numeric, 1) as avg_score,
         MAX(value) as max_score,
         MIN(value) as min_score
       FROM metrics
       WHERE server_id = $1 AND metric_type = $2`,
      [request.params.id, metricType],
    );

    return reply.send({
      server_id: request.params.id,
      metric_type: metricType,
      metrics: rows,
      stats: statsRows[0],
    });
  });

  // GET /v1/metrics — aggregate metrics across all servers for tenant
  app.get<{ Querystring: { limit?: string } }>('/v1/metrics', async (request, reply) => {
    const limit = Math.min(Number(request.query.limit) || 50, 500);

    const { rows } = await pool.query(
      `SELECT m.metric_type, m.value, m.metadata, m.created_at, s.name as server_name, s.id as server_id
       FROM metrics m
       JOIN servers s ON s.id = m.server_id
       WHERE s.tenant_id = $1
       ORDER BY m.created_at DESC LIMIT $2`,
      [request.tenantId, limit],
    );

    return reply.send({ metrics: rows });
  });
}
