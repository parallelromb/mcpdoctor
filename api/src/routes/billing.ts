import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { PLANS, handleStripeWebhook } from '../billing/stripe.js';
import { pool } from '../db/pool.js';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  // GET /v1/billing/plans — list all plans (public)
  app.get('/v1/billing/plans', async (_request, reply) => {
    const plans = Object.entries(PLANS).map(([name, plan]) => ({
      name,
      price_monthly: plan.price_monthly,
      server_limit: plan.server_limit,
      retention_days: plan.retention_days,
      monitoring: plan.monitoring,
      security_checks: plan.security_checks,
    }));
    return reply.send({ plans });
  });

  // GET /v1/billing — current tenant billing info (requires auth)
  app.get('/v1/billing', { preHandler: authenticate }, async (request, reply) => {
    const { rows } = await pool.query(
      'SELECT plan, server_limit, retention_days, stripe_customer_id, created_at FROM tenants WHERE id = $1',
      [request.tenantId],
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Tenant not found' });

    const tenant = rows[0] as Record<string, unknown>;
    const planData = PLANS[tenant.plan as keyof typeof PLANS] ?? PLANS.free;

    return reply.send({
      plan: tenant.plan,
      price_monthly: planData.price_monthly,
      server_limit: tenant.server_limit,
      retention_days: tenant.retention_days,
      has_stripe: !!tenant.stripe_customer_id,
      features: {
        monitoring: planData.monitoring,
        security_checks: planData.security_checks,
      },
    });
  });

  // POST /v1/billing/webhook — Stripe webhook (no auth, raw body needed)
  app.post('/v1/billing/webhook', {
    config: { rawBody: true },
  }, handleStripeWebhook);
}
