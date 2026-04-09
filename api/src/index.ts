import Fastify from 'fastify';
import cors from '@fastify/cors';
import { pool } from './db/pool.js';
import { healthRoutes } from './routes/health.js';
import { setupRoutes } from './routes/setup.js';
import { serverRoutes } from './routes/servers.js';
import { testSuiteRoutes } from './routes/test-suite.js';
import { metricsRoutes } from './routes/metrics.js';
import { billingRoutes } from './routes/billing.js';
import { waitlistRoutes } from './routes/waitlist.js';

const PORT = Number(process.env.PORT) || 3020;

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Enable pgvector extension (future use)
      CREATE EXTENSION IF NOT EXISTS vector;

      -- Tenants
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL DEFAULT 'Default',
        email TEXT UNIQUE,
        plan TEXT NOT NULL DEFAULT 'free',
        server_limit INTEGER NOT NULL DEFAULT 1,
        retention_days INTEGER NOT NULL DEFAULT 1,
        stripe_customer_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- API Keys
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        label TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- MCP Servers
      CREATE TABLE IF NOT EXISTS servers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        transport TEXT NOT NULL DEFAULT 'stdio' CHECK (transport IN ('stdio', 'sse', 'streamable-http')),
        command TEXT,
        args JSONB DEFAULT '[]',
        url TEXT,
        env JSONB DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'active',
        last_tested_at TIMESTAMPTZ,
        last_score INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Test Runs
      CREATE TABLE IF NOT EXISTS test_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'passed', 'failed', 'error')),
        score INTEGER,
        grade TEXT,
        total_checks INTEGER,
        passed INTEGER,
        failed INTEGER,
        skipped INTEGER,
        duration_ms INTEGER,
        results JSONB DEFAULT '[]',
        summary TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      -- Individual check results
      CREATE TABLE IF NOT EXISTS check_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
        check_id TEXT NOT NULL,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'error')),
        duration_ms INTEGER,
        message TEXT,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Metrics
      CREATE TABLE IF NOT EXISTS metrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        metric_type TEXT NOT NULL,
        value FLOAT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Waitlist
      CREATE TABLE IF NOT EXISTS waitlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        source TEXT DEFAULT 'website',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS test_runs_server_idx ON test_runs(server_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS test_runs_tenant_idx ON test_runs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS check_results_run_idx ON check_results(test_run_id);
      CREATE INDEX IF NOT EXISTS metrics_server_idx ON metrics(server_id, created_at DESC);
    `);
    console.log('[migrate] Database schema applied');
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await migrate();

  const app = Fastify({ logger: { level: 'info' } });

  await app.register(cors, { origin: true });

  // Register all routes
  await app.register(healthRoutes);
  await app.register(setupRoutes);
  await app.register(serverRoutes);
  await app.register(testSuiteRoutes);
  await app.register(metricsRoutes);
  await app.register(billingRoutes);
  await app.register(waitlistRoutes);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`MCP Doctor API listening on port ${PORT}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
