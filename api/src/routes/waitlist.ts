import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';

export async function waitlistRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/waitlist — add email to waitlist (no auth required)
  app.post<{ Body: { email: string; source?: string } }>(
    '/v1/waitlist',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            source: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const email = request.body.email.toLowerCase().trim();
      const source = request.body.source ?? 'website';

      if (!email.includes('@')) {
        return reply.code(400).send({ error: 'Invalid email' });
      }

      try {
        await pool.query(
          `INSERT INTO waitlist (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
          [email, source],
        );
        return reply.code(201).send({ message: "You're on the waitlist! We'll be in touch." });
      } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr.code === '23505') {
          return reply.code(200).send({ message: "You're already on the waitlist!" });
        }
        throw err;
      }
    },
  );

  // GET /v1/waitlist/count — return waitlist count (no auth required)
  app.get('/v1/waitlist/count', async (_request, reply) => {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM waitlist');
    const count = Number(rows[0].count);
    // Add a base count to make the number look more credible at launch
    const displayCount = count + 47;
    return reply.send({ count: displayCount, raw_count: count });
  });
}
