import { createHash, randomBytes } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from '../db/pool.js';

// Simple in-memory rate limiter for signup: max 5 per IP per hour
const signupAttempts = new Map<string, { count: number; resetAt: number }>();
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

function checkSignupRate(request: FastifyRequest): boolean {
  const ip = request.ip;
  const now = Date.now();
  const entry = signupAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    signupAttempts.set(ip, { count: 1, resetAt: now + SIGNUP_WINDOW_MS });
    return true;
  }
  if (entry.count >= SIGNUP_LIMIT) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of signupAttempts) {
    if (now > entry.resetAt) signupAttempts.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function generateApiKey(): string {
  return `mcd_${randomBytes(32).toString('hex')}`;
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export async function setupRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/signup — email-based signup, returns API key
  app.post<{ Body: { email: string; name?: string } }>(
    '/v1/signup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            name: { type: 'string', minLength: 1, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!checkSignupRate(request)) {
        return reply.code(429).send({ error: 'Too many signup attempts. Try again in an hour.' });
      }

      const email = request.body.email.toLowerCase().trim();
      const name = request.body.name ?? email.split('@')[0] ?? 'User';

      if (!email || !email.includes('@') || !email.includes('.')) {
        return reply.code(400).send({ error: 'Invalid email address' });
      }

      // Check if email already has a tenant
      const { rows: existing } = await pool.query(
        'SELECT id FROM tenants WHERE email = $1 LIMIT 1',
        [email],
      );
      if (existing.length > 0) {
        return reply.code(409).send({
          error: 'already_registered',
          message: 'This email already has an account. Contact support if you need a new API key.',
        });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: tenantRows } = await client.query<{ id: string }>(
          `INSERT INTO tenants (name, email) VALUES ($1, $2) RETURNING id`,
          [name, email],
        );
        const tenantId = tenantRows[0].id;

        const rawKey = generateApiKey();
        const keyHash = hashKey(rawKey);

        await client.query(
          `INSERT INTO api_keys (tenant_id, key_hash, label) VALUES ($1, $2, $3)`,
          [tenantId, keyHash, 'Default key'],
        );

        await client.query('COMMIT');

        return reply.code(201).send({
          tenant_id: tenantId,
          api_key: rawKey,
          plan: 'free',
          server_limit: 1,
          message: 'Save this API key — it cannot be recovered. Use as: Authorization: Bearer <key>',
        });
      } catch (err: unknown) {
        await client.query('ROLLBACK');
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr.code === '23505' && pgErr.constraint?.includes('email')) {
          return reply.code(409).send({
            error: 'already_registered',
            message: 'This email already has an account.',
          });
        }
        throw err;
      } finally {
        client.release();
      }
    },
  );

  // POST /v1/keys — provision additional API keys (requires auth)
  // (Minimal impl — could expand with key management later)
}
