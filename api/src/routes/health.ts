import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    let dbStatus: 'ok' | 'error' = 'error';
    try {
      await pool.query('SELECT 1');
      dbStatus = 'ok';
    } catch {
      // db unreachable
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';
    const code = dbStatus === 'ok' ? 200 : 503;

    return reply.code(code).send({ status, db: dbStatus });
  });
}
