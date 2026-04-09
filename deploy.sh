#!/bin/bash
set -euo pipefail

echo "=== Deploying MCP Doctor ==="

# Deploy API to Railway
echo ">> Deploying API to Railway..."
cd api
railway up --service mcpdoctor-api -d
cd ..

# Deploy site to Cloudflare Pages
echo ">> Deploying site to Cloudflare Pages..."
wrangler pages deploy site --project-name=mcpdoctor-landing

echo "=== Deploy complete ==="
echo "API:  https://api.mcpdoctor.ai/health"
echo "Site: https://mcpdoctor.ai"
