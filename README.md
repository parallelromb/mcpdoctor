# MCP Doctor

Postman meets Datadog for MCP servers. Test, monitor, and debug Model Context Protocol servers.

## Quick Start

```bash
# Start PostgreSQL + API with Docker
docker compose up --build

# API available at http://localhost:3020
```

## Local Development (without Docker)

```bash
# Start PostgreSQL separately (port 5434)
cp .env.example .env
cd api && npm install && npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/v1/signup` | Create account (email) |
| POST | `/v1/servers` | Register an MCP server |
| GET | `/v1/servers` | List servers |
| GET | `/v1/servers/:id` | Server details + recent tests |
| DELETE | `/v1/servers/:id` | Remove server |
| POST | `/v1/tests` | Run compliance test suite |
| GET | `/v1/tests` | List test runs |
| GET | `/v1/tests/:id` | Get test run results |

## Auth

All endpoints except `/health` and `/v1/signup` require `Authorization: Bearer <api_key>`.
