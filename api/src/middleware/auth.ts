import { createHash } from 'crypto';
import { pool } from '../db/pool.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    tenantPlan: string;
    tenantServerLimit: number;
    tenantRetentionDays: number;
  }
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid Authorization header. Use: Authorization: Bearer mcd_...' });
    return;
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey.startsWith('mcd_')) {
    reply.code(401).send({ error: 'Invalid API key format. Keys must start with mcd_' });
    return;
  }

  const keyHash = hashKey(rawKey);

  const { rows } = await pool.query<{
    tenant_id: string;
    plan: string;
    server_limit: number;
    retention_days: number;
  }>(
    `SELECT a.tenant_id, t.plan, t.server_limit, t.retention_days
     FROM api_keys a
     JOIN tenants t ON t.id = a.tenant_id
     WHERE a.key_hash = $1`,
    [keyHash],
  );

  if (rows.length === 0) {
    reply.code(401).send({ error: 'Invalid API key' });
    return;
  }

  request.tenantId = rows[0].tenant_id;
  request.tenantPlan = rows[0].plan;
  request.tenantServerLimit = rows[0].server_limit;
  request.tenantRetentionDays = rows[0].retention_days;
}
