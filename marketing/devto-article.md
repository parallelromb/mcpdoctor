---
title: How to Test Your MCP Server for Protocol Compliance
published: true
description: A practical guide to testing MCP servers with MCP Doctor — 50+ automated checks for protocol, tools, resources, error handling, and security.
tags: mcp, testing, ai, tooling
cover_image: https://mcpdoctor.ai/og-image.png
---

# How to Test Your MCP Server for Protocol Compliance

MCP (Model Context Protocol) has become the standard way to connect AI assistants to external tools and data. With 97M+ SDK downloads per month and support in Claude, Cursor, Windsurf, and dozens of other clients, chances are you're either building or consuming MCP servers.

But here's the thing: **nobody tests them**.

Most MCP servers are built, manually checked against one client, and shipped. There's no test suite, no compliance check, no way to know if your server handles edge cases correctly until a user hits them in production.

I built [MCP Doctor](https://github.com/parallelromb/mcpdoctor) to fix this.

## The Problem

The MCP specification defines a full JSON-RPC 2.0 protocol with specific requirements for:

- How servers must respond to the `initialize` handshake
- What format `tools/list` and `tools/call` responses should follow
- How errors must be reported (specific error codes, not just "something went wrong")
- How resources and prompts should behave
- Edge cases around malformed inputs, missing parameters, and timeouts

In practice, most servers get the happy path right and skip everything else. This leads to:

- **Silent failures** — Claude calls a tool, gets a malformed response, retries 3 times, then gives up
- **Client-specific bugs** — works in Claude Desktop but fails in Cursor because of a subtle difference in how they handle capabilities
- **Security gaps** — no input validation, path traversal possible, no resource boundaries

## Enter MCP Doctor

MCP Doctor is a free, open-source CLI that runs 50+ compliance checks against any MCP server. No install needed:

```bash
npx mcpdoctor --server "node my-server.js"
```

It connects to your server, runs every check, and gives you a detailed report with a letter grade.

## What It Tests

### 1. Protocol Compliance

The foundation. MCP Doctor tests whether your server correctly implements the MCP handshake and core protocol:

```
Protocol
  ✓ Initialize handshake completes
  ✓ Server returns valid capabilities object
  ✓ JSON-RPC 2.0 message format correct
  ✓ Capability negotiation follows spec
  ✓ Server info (name, version) present
  ✗ Shutdown handles gracefully              [WARN]
```

**Common failures:**
- Missing `serverInfo` in initialize response
- Capabilities object missing required fields
- Not responding to `ping` requests

### 2. Tools

If your server exposes tools, MCP Doctor validates the full lifecycle:

```
Tools
  ✓ tools/list returns valid response
  ✓ Tool schemas are valid JSON Schema
  ✓ tools/call with valid input succeeds
  ✗ tools/call with invalid input returns proper error
  ✓ Tool names follow naming conventions
  ✓ Tool descriptions present and non-empty
  ✓ Required parameters enforced
```

**Common failures:**
- Tool input schemas that aren't valid JSON Schema (e.g., using `required` on non-object types)
- Not returning proper error objects when tools/call fails
- Missing descriptions (clients use these to decide when to call your tool)

### 3. Resources

Resources let servers expose data that AI assistants can read:

```
Resources
  ✓ resources/list returns valid response
  ✓ resources/read returns content array
  ✓ URI format follows spec
  ✓ MIME types present and valid
  ✓ Resource templates resolve correctly
```

**Common failures:**
- URIs that don't follow the `scheme://path` format
- Missing MIME types on content
- resources/read returning a string instead of a content array

### 4. Prompts

Prompts are reusable templates that servers can expose:

```
Prompts
  ✓ prompts/list returns valid response
  ✓ prompts/get returns messages array
  ✓ Required arguments enforced
  ✓ Argument descriptions present
```

### 5. Error Handling

This is where most servers fail. The MCP spec requires specific JSON-RPC error codes:

```
Error Handling
  ✓ Invalid method returns -32601 (MethodNotFound)
  ✗ Malformed JSON-RPC returns -32700 (ParseError)
  ✓ Invalid params returns -32602 (InvalidParams)
  ✓ Missing required params handled
  ✗ Oversized payload handled gracefully
  ✓ Concurrent requests don't cause race conditions
```

**Common failures:**
- Returning generic error messages instead of proper JSON-RPC error codes
- Crashing on malformed input instead of returning a ParseError
- Not handling concurrent requests safely

### 6. Security

Basic security checks that every MCP server should pass:

```
Security
  ✓ Path traversal inputs rejected
  ✓ Input length limits enforced
  ✓ No sensitive data in error messages
  ✓ Resource access stays within boundaries
```

## Running MCP Doctor

### Basic usage

```bash
# Test a stdio server (most common)
npx mcpdoctor --server "node my-server.js"

# Test a Python server
npx mcpdoctor --server "python server.py"

# Test an SSE server
npx mcpdoctor --url http://localhost:3000/mcp --transport sse
```

### CI/CD Integration

MCP Doctor is designed to run in CI pipelines. It exits with a non-zero code when the grade falls below a threshold:

```bash
# Fail CI if grade is below B
npx mcpdoctor --server "node dist/server.js" --fail-under B

# JSON output for parsing
npx mcpdoctor --server "node dist/server.js" --format json
```

### GitHub Actions example

```yaml
name: MCP Compliance
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18

      - run: npm install
      - run: npm run build

      - name: MCP compliance check
        run: npx mcpdoctor --server "node dist/server.js" --fail-under B --format json
```

### Interpreting the grades

| Grade | Meaning |
|-------|---------|
| **A** | Full compliance. All critical checks pass, minor warnings only. |
| **B** | Good compliance. A few non-critical checks fail. Safe for production. |
| **C** | Partial compliance. Some error handling or edge cases missing. Will work but may cause issues with some clients. |
| **D** | Significant issues. Core protocol works but many checks fail. |
| **F** | Major failures. Protocol handshake or core functionality broken. |

## Real-World Example

Let's say you've built a simple MCP server that exposes a `get_weather` tool:

```typescript
// weather-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "weather-server",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler("tools/list", async () => ({
  tools: [{
    name: "get_weather",
    description: "Get current weather for a city",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name" }
      },
      required: ["city"]
    }
  }]
}));

server.setRequestHandler("tools/call", async (request) => {
  // ... implementation
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

Running MCP Doctor against this:

```bash
$ npx mcpdoctor --server "npx tsx weather-server.ts"

  MCP Doctor v1.0.0
  Testing: npx tsx weather-server.ts

  Score: 44/53 checks passed
  Grade: B+

  Issues:
  - tools/call does not return proper error for invalid input
  - Shutdown not handled gracefully
  - No resources capability declared but resources/list not rejected
```

Now you know exactly what to fix before shipping.

## What MCP Doctor Is Not

- **Not a linter** — it doesn't check your code style or tool descriptions for quality. It tests actual protocol behavior by connecting to your running server.
- **Not a monitor** — it runs once and gives you a report. It's a test tool, not an observability platform.
- **Not client-specific** — it tests against the MCP spec, not against how a specific client (Claude, Cursor, etc.) implements MCP.

## Getting Started

```bash
npx mcpdoctor --server "node your-server.js"
```

That's it. No signup, no API key, no config file.

- **GitHub:** [github.com/parallelromb/mcpdoctor](https://github.com/parallelromb/mcpdoctor)
- **Website:** [mcpdoctor.ai](https://mcpdoctor.ai)
- **License:** MIT

If you're building MCP servers, I'd love your feedback on which checks matter most and what's missing. Open an issue or drop a comment below.
