/**
 * Stripe billing integration for MCP Doctor.
 * Plan definitions and webhook handler.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../db/pool.js';

export const PLANS = {
  free: {
    server_limit: 1,
    retention_days: 1,
    monitoring: false,
    security_checks: false,
    price_id: null,
    price_monthly: 0,
  },
  starter: {
    server_limit: 1,
    retention_days: 7,
    monitoring: false,
    security_checks: false,
    price_id: process.env.STRIPE_STARTER_PRICE_ID ?? '',
    price_monthly: 9,
  },
  pro: {
    server_limit: 5,
    retention_days: 30,
    monitoring: true,
    security_checks: false,
    price_id: process.env.STRIPE_PRO_PRICE_ID ?? '',
    price_monthly: 29,
  },
  team: {
    server_limit: 999,
    retention_days: 90,
    monitoring: true,
    security_checks: true,
    price_id: process.env.STRIPE_TEAM_PRICE_ID ?? '',
    price_monthly: 99,
  },
} as const;

export type PlanName = keyof typeof PLANS;

export function getPlanLimits(plan: string): {
  server_limit: number;
  retention_days: number;
  monitoring: boolean;
  security_checks: boolean;
} {
  const planData = PLANS[plan as PlanName] ?? PLANS.free;
  return {
    server_limit: planData.server_limit,
    retention_days: planData.retention_days,
    monitoring: planData.monitoring,
    security_checks: planData.security_checks,
  };
}

/**
 * Handle Stripe webhook events.
 */
export async function handleStripeWebhook(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const stripeSignature = request.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSignature || !webhookSecret) {
    return reply.code(400).send({ error: 'Missing Stripe signature or webhook secret' });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(request.body as string) as typeof event;
  } catch {
    return reply.code(400).send({ error: 'Invalid JSON' });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const status = subscription.status as string;
        const priceId = (subscription as unknown as { items: { data: Array<{ price: { id: string } }> } })
          .items?.data?.[0]?.price?.id ?? '';

        let plan: PlanName = 'free';
        for (const [planName, planData] of Object.entries(PLANS)) {
          if (planData.price_id && planData.price_id === priceId) {
            plan = planName as PlanName;
            break;
          }
        }

        if (status === 'active' || status === 'trialing') {
          const limits = getPlanLimits(plan);
          await pool.query(
            `UPDATE tenants SET plan = $1, server_limit = $2, retention_days = $3 WHERE stripe_customer_id = $4`,
            [plan, limits.server_limit, limits.retention_days, customerId],
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const limits = getPlanLimits('free');
        await pool.query(
          `UPDATE tenants SET plan = 'free', server_limit = $1, retention_days = $2 WHERE stripe_customer_id = $3`,
          [limits.server_limit, limits.retention_days, customerId],
        );
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer as string;
        const customerEmail = (session.customer_details as Record<string, unknown>)?.email as string | undefined;
        if (customerEmail) {
          await pool.query(
            `UPDATE tenants SET stripe_customer_id = $1 WHERE email = $2`,
            [customerId, customerEmail.toLowerCase()],
          );
        }
        break;
      }

      default:
        break;
    }

    return reply.send({ received: true });
  } catch (err) {
    console.error('[stripe] Webhook error:', err);
    return reply.code(500).send({ error: 'Webhook processing failed' });
  }
}
