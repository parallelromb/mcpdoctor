# MCP Doctor — free compliance testing CLI for MCP servers (works with any client, any model)

MCP (Model Context Protocol) is becoming the standard way to give LLMs access to tools and data. If you're running local MCP servers — whether for Ollama, LM Studio, or any other local setup — you want to make sure they actually implement the protocol correctly.

I built **MCP Doctor**: a free, open-source CLI that runs 50+ compliance checks against any MCP server and scores it A through F.

## What it tests

- **Protocol** — initialize handshake, capability negotiation, JSON-RPC 2.0 compliance
- **Tools** — tools/list, tools/call, schema validation, error handling on bad inputs
- **Resources** — resources/list, resources/read, URI format
- **Prompts** — prompts/list, prompts/get, argument handling
- **Error handling** — proper error codes, graceful failure, timeout behavior
- **Security** — input sanitization, path traversal, resource boundaries

## Why this matters for local setups

When you're running everything locally, debugging MCP failures is especially painful because:
1. No server logs from a hosted provider to check
2. Different clients implement MCP slightly differently
3. Many community servers skip edge cases that only break with certain models

MCP Doctor tells you exactly which parts of the spec your server handles correctly and which it doesn't — independent of any specific client or model.

## Usage

```bash
# Test a local stdio server
npx mcpdoctor --server "node my-server.js"
npx mcpdoctor --server "python server.py"

# Test SSE transport (e.g., server running on localhost)
npx mcpdoctor --url http://localhost:3000/mcp --transport sse

# JSON output for scripting
npx mcpdoctor --server "node server.js" --format json
```

No signup, no install (runs via npx), no telemetry. MIT licensed.

- GitHub: [parallelromb/mcpdoctor](https://github.com/parallelromb/mcpdoctor)
- Website: [mcpdoctor.ai](https://mcpdoctor.ai)

If you're building or using MCP servers locally, I'd love to know what checks would be most useful. Feedback welcome.
