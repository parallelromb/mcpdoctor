# Test your Cursor MCP servers for protocol compliance — free CLI (npx mcpdoctor)

Cursor's MCP support is powerful but debugging MCP server issues is painful. When a tool call fails, Cursor just shows "tool call failed" with no detail on what went wrong protocol-wise.

I built **MCP Doctor** — a free CLI that runs 50+ protocol compliance checks against any MCP server and gives you a clear pass/fail report with a letter grade.

## Example output

```bash
$ npx mcpdoctor --server "node my-cursor-tool.js"

  MCP Doctor v1.0.0
  Testing: node my-cursor-tool.js

  Protocol
    ✓ Initialize handshake completes
    ✓ Server returns valid capabilities
    ✓ JSON-RPC 2.0 message format
    ✓ Capability negotiation correct

  Tools
    ✓ tools/list returns valid response
    ✓ Tool schemas are valid JSON Schema
    ✓ tools/call with valid input succeeds
    ✗ tools/call with invalid input returns proper error
    ✓ Tool descriptions present and non-empty

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
```

## Why this matters for Cursor users

Every MCP server you add to Cursor needs to correctly implement:
- The initialize handshake (or Cursor can't discover tools)
- Proper tools/list format (or tools won't appear)
- Correct error codes (or Cursor can't recover from failures)
- Valid JSON-RPC 2.0 (or messages get dropped silently)

MCP Doctor tests all of this in seconds. Run it before adding a server to your `.cursor/mcp.json` and save yourself the debugging.

## Usage

```bash
# Test any stdio MCP server
npx mcpdoctor --server "node my-server.js"

# Test SSE transport
npx mcpdoctor --url http://localhost:3000/mcp --transport sse

# Add to your CI pipeline
npx mcpdoctor --server "node dist/server.js" --format json --fail-under B
```

Zero install. MIT licensed. [GitHub](https://github.com/parallelromb/mcpdoctor) | [mcpdoctor.ai](https://mcpdoctor.ai)

What MCP servers are you using with Cursor? Would love to know what checks would be most useful.
