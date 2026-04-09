# Test your MCP servers before connecting them to Claude — free CLI tool (npx mcpdoctor)

If you're using MCP servers with Claude Code or Claude Desktop, you've probably hit silent failures — tools that don't return the right format, servers that fail the initialize handshake, resources that break under edge cases.

I built **MCP Doctor** to fix this. It's a free, open-source CLI that runs 50+ compliance checks against any MCP server and scores it A through F.

## Quick demo

```bash
$ npx mcpdoctor --server "node my-mcp-server.js"

  MCP Doctor v1.0.0
  Testing: node my-mcp-server.js
  Transport: stdio

  Protocol
    ✓ Initialize handshake completes
    ✓ Server returns valid capabilities
    ✓ JSON-RPC 2.0 message format
    ✓ Capability negotiation correct
    ✗ Shutdown handles gracefully          [WARN]

  Tools
    ✓ tools/list returns valid response
    ✓ Tool schemas are valid JSON Schema
    ✓ tools/call with valid input succeeds
    ✗ tools/call with invalid input returns proper error
    ✓ Tool descriptions present and non-empty

  Resources
    ✓ resources/list returns valid response
    ✓ resources/read returns content
    ✓ URI format follows spec

  Error Handling
    ✓ Invalid method returns MethodNotFound
    ✗ Malformed JSON-RPC returns ParseError
    ✓ Missing params handled gracefully

  Security
    ✓ Path traversal inputs rejected
    ✓ Input length limits enforced

  ─────────────────────────────────
  Score: 47/53 checks passed
  Grade: B+

  Protocol: A  | Tools: B+ | Resources: A
  Errors: B    | Security: A
```

## Why this matters for Claude users

Claude Code and Claude Desktop trust that MCP servers implement the protocol correctly. When they don't, you get:

- Silent tool failures that Claude retries endlessly
- Malformed responses that confuse Claude's reasoning
- Security issues in community servers you haven't audited

MCP Doctor catches these before you connect the server.

## How to use

```bash
# Test a stdio server
npx mcpdoctor --server "node my-server.js"

# Test an SSE server
npx mcpdoctor --url http://localhost:3000/mcp --transport sse

# JSON output for CI/CD
npx mcpdoctor --server "node my-server.js" --format json
```

No install needed. MIT licensed. [GitHub](https://github.com/parallelromb/mcpdoctor) | [Website](https://mcpdoctor.ai)

Feedback welcome — what checks would be most useful for your Claude workflow?
