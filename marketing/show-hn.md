# Show HN: MCP Doctor – Compliance testing CLI for MCP servers (npx mcpdoctor)

I built **MCP Doctor**, a free CLI tool that runs 50+ compliance checks against any MCP (Model Context Protocol) server and gives it a grade from A to F.

## Why I built it

MCP has exploded — 97M+ SDK downloads/month, thousands of servers listed on directories, and every AI IDE now supports it. But there's no standard way to test whether an MCP server actually implements the protocol correctly.

I've been building MCP servers for my own projects and kept running into the same issues: tools returning malformed JSON, missing error codes, resources not following the spec, initialize handshakes failing silently. Every time I plugged a new community server into Claude or Cursor, I had to debug these manually.

So I built a tool that does it automatically.

## What it checks

MCP Doctor tests 6 categories:

- **Protocol** — initialize handshake, capability negotiation, JSON-RPC compliance
- **Tools** — tools/list response format, tools/call with valid and invalid inputs, schema validation
- **Resources** — resources/list, resources/read, URI format compliance
- **Prompts** — prompts/list, prompts/get, argument handling
- **Error handling** — proper error codes, graceful failure on bad inputs, timeout behavior
- **Security** — input sanitization, path traversal checks, resource access boundaries

Each check maps to the official MCP specification. You get a per-category score and an overall grade.

## How to try it

```bash
npx mcpdoctor --server "node my-server.js"
npx mcpdoctor --server "python server.py" --transport stdio
npx mcpdoctor --url http://localhost:3000/mcp --transport sse
```

No install, no config, no account needed.

## Details

- MIT licensed: [github.com/parallelromb/mcpdoctor](https://github.com/parallelromb/mcpdoctor)
- Website: [mcpdoctor.ai](https://mcpdoctor.ai)
- TypeScript, runs on Node 18+
- CI/CD friendly — exits with non-zero code on failure, supports JSON output

I'm not aware of any other tool that does actual protocol compliance testing for MCP. There's destilabs/mcp-doctor which lints tool descriptions, and the official MCP Inspector for interactive debugging, but nothing that runs a full automated test suite against the spec.

Feedback welcome — especially on which checks matter most to you and what I'm missing.
