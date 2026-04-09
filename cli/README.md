# mcpdoctor

**Compliance testing CLI for MCP servers. 50+ checks. One command.**

[![npm version](https://img.shields.io/npm/v/mcpdoctor?color=cb3837&label=npm)](https://www.npmjs.com/package/mcpdoctor)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

Test any [Model Context Protocol](https://modelcontextprotocol.io) server against 50+ compliance checks covering protocol correctness, tool/resource/prompt schemas, error handling, and security. Get a score out of 100.

```bash
npx mcpdoctor test "node my-server.js"
```

---

## Installation

```bash
# Run directly with npx (no install needed)
npx mcpdoctor test "node server.js"

# Or install globally
npm install -g mcpdoctor
mcpdoctor test "node server.js"
```

---

## Output

```
  MCP Doctor v1.0.0 — Compliance Test Suite
  ──────────────────────────────────────────

  Server:    my-server v1.0.0
  Transport: stdio
  Protocol:  2024-11-05

  PROTOCOL
  ✓ Initialize Handshake                              2ms
  ✓ Initialized Notification Accepted                  0ms
  ✓ Server Info Present                                0ms
  ✓ Capabilities Format Valid                          0ms
  ✓ Ping Response                                    15ms
  ✓ JSON-RPC 2.0 Envelope                              1ms
  ✓ Error Code Compliance                              3ms
  ✓ Unknown Method Returns Error                       5ms
  ✓ Request ID Echoed                                  1ms
  ✓ Protocol Version Accepted                          0ms

  TOOLS
  ✓ tools/list Returns Valid Array                     8ms
  ✓ Tool Schema Has Required Fields                    3ms
  ✓ Input Schema Is Valid JSON Schema                  2ms
  ✓ Tool Call Returns Content Array                   12ms
  ✗ Tool Call With Invalid Params Returns Error        4ms
    → Server returned 200 instead of error response
  ...

  SECURITY
  ✓ No Environment Variable Leaks                     4ms
  ✓ Path Traversal Rejected                            6ms
  ✓ SQL Injection in Tool Args                         3ms
  ✓ Command Injection Blocked                          5ms
  ...

  ──────────────────────────────────────────
  Score: 92/100 (A)

  48 passed · 2 failed · 3 skipped · 0 errors
  Total time: 1.2s
```

---

## Usage Examples

### Test a local stdio server

```bash
mcpdoctor test "node my-server.js"
```

### Test an npm package

```bash
mcpdoctor test "npx @company/mcp-server"
```

### Test with environment variables

```bash
mcpdoctor test "node server.js" --env API_KEY=abc123 --env DEBUG=true
```

### Test an HTTP/SSE server

```bash
mcpdoctor test --transport sse --url http://localhost:3001/sse
mcpdoctor test --transport streamable-http --url http://localhost:3001/mcp
```

### Run only one category

```bash
mcpdoctor test "node server.js" --category protocol
mcpdoctor test "node server.js" --category security
```

### JSON output for CI pipelines

```bash
mcpdoctor test "node server.js" --format json > report.json
```

### Markdown report for pull requests

```bash
mcpdoctor test "node server.js" --format markdown > report.md
```

### Verbose mode (show failure details)

```bash
mcpdoctor test "node server.js" --verbose
```

---

## CLI Reference

```
mcpdoctor test <command> [options]

Arguments:
  command              Server command to test (e.g., "node server.js")

Options:
  --transport <type>   Transport type: stdio (default), sse, streamable-http
  --url <url>          Server URL (for sse/http transports)
  --env <key=value>    Environment variables (repeatable)
  --timeout <ms>       Per-check timeout in ms (default: 10000)
  --format <type>      Output format: pretty (default), json, markdown
  --category <cat>     Run only checks in this category
  --verbose            Show detailed output for each check
  --version            Show version
  --help               Show help
```

---

## Check Categories

| Category | Checks | What it tests |
|----------|:------:|---------------|
| **protocol** | 10 | Initialize handshake, JSON-RPC 2.0 compliance, error codes, ping |
| **tools** | 10 | Tool listing, schemas, calls, content format, uniqueness |
| **resources** | 8 | Resource listing, URIs, reading, templates, subscriptions |
| **prompts** | 7 | Prompt listing, arguments, message format, required params |
| **error_handling** | 8 | Timeouts, malformed input, concurrency, oversized payloads |
| **security** | 7 | Env leak detection, path traversal, injection, stack traces |

---

## CI/CD Integration

### GitHub Actions

```yaml
name: MCP Compliance
on: [push, pull_request]

jobs:
  mcp-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install

      - name: Run MCP compliance tests
        run: npx mcpdoctor test "node dist/server.js" --format json > mcp-report.json

      - name: Check score
        run: |
          SCORE=$(jq '.score' mcp-report.json)
          echo "MCP Compliance Score: $SCORE/100"
          if [ "$SCORE" -lt 80 ]; then
            echo "::error::MCP compliance score $SCORE is below threshold (80)"
            exit 1
          fi

      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mcp-compliance-report
          path: mcp-report.json
```

### PR Comment

```yaml
      - name: Generate markdown report
        if: github.event_name == 'pull_request'
        run: npx mcpdoctor test "node dist/server.js" --format markdown > mcp-report.md

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          path: mcp-report.md
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed |
| `1` | One or more checks failed or errored |

---

## Links

- **Website:** [mcpdoctor.ai](https://mcpdoctor.ai)
- **GitHub:** [github.com/parallelromb/mcpdoctor](https://github.com/parallelromb/mcpdoctor)

## License

MIT

---

<div align="center">

Built by [Sri](https://github.com/parallelromb) &bull; Free and open source forever

</div>
