<div align="center">

```
   __  __  ____ ____    ____             _
  |  \/  |/ ___|  _ \  |  _ \  ___   ___| |_ ___  _ __
  | |\/| | |   | |_) | | | | |/ _ \ / __| __/ _ \| '__|
  | |  | | |___|  __/  | |_| | (_) | (__| || (_) | |
  |_|  |_|\____|_|     |____/ \___/ \___|\__\___/|_|
```

**Compliance testing for MCP servers. 50+ checks. One command.**

[![npm version](https://img.shields.io/npm/v/mcpdoctor?color=cb3837&label=npm)](https://www.npmjs.com/package/mcpdoctor)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/parallelromb/mcpdoctor?style=social)](https://github.com/parallelromb/mcpdoctor)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

[Website](https://mcpdoctor.ai) &bull; [npm](https://www.npmjs.com/package/mcpdoctor) &bull; [GitHub](https://github.com/parallelromb/mcpdoctor)

</div>

---

MCP Doctor is a free, open-source CLI that tests any [Model Context Protocol](https://modelcontextprotocol.io) server against 50+ compliance checks. It validates protocol correctness, tool/resource/prompt schemas, error handling, and security -- then gives you a score out of 100.

```bash
npx mcpdoctor test "node my-server.js"
```

---

## Terminal Output

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
  ✓ Text Content Has Type + Text                       1ms
  ✗ Tool Call With Invalid Params Returns Error        4ms
    → Server returned 200 instead of error response
  ✓ Empty Arguments Handled                            5ms
  ✓ Tool Names Are Unique                              0ms
  ✓ Tool Description Present                           0ms
  ✓ Large Payload Handled                            45ms

  RESOURCES
  ✓ resources/list Returns Valid Array                  6ms
  ✓ Resource URI Format Valid                          1ms
  ✓ Resource Read Returns Contents                     9ms
  ✓ MIME Type Present                                  0ms
  ✓ Template URI Expansion                             3ms
  ○ Subscribe Notification (skipped — not declared)
  ✓ Resource Names Unique                              0ms
  ✓ Invalid URI Returns Error                          2ms

  PROMPTS
  ✓ prompts/list Returns Valid Array                   5ms
  ✓ Prompt Has Name + Description                      0ms
  ✓ Prompt Arguments Defined                           1ms
  ✓ Get Prompt Returns Messages                        7ms
  ✓ Messages Have Role + Content                       0ms
  ✗ Required Argument Missing Returns Error            3ms
    → Server returned messages instead of error
  ✓ Prompt Names Unique                                0ms

  ERROR HANDLING
  ✓ Malformed JSON-RPC Rejected                        2ms
  ✓ Missing Method Returns Error                       1ms
  ✓ Concurrent Requests Handled                      28ms
  ✓ Timeout Behavior                                5001ms
  ✓ Invalid Params Rejected                            3ms
  ✓ Oversized Payload Rejected                        11ms
  ✓ Null ID Request Handled                            1ms
  ✓ Batch Not Supported Error                          2ms

  SECURITY
  ✓ No Environment Variable Leaks                     4ms
  ✓ Path Traversal Rejected                            6ms
  ✓ SQL Injection in Tool Args                         3ms
  ✓ Command Injection Blocked                          5ms
  ✓ Sensitive Field Redaction                          2ms
  ○ TLS Certificate Valid (skipped — stdio transport)
  ✓ No Verbose Error Stack Traces                      1ms

  ──────────────────────────────────────────
  Score: 92/100 (A)

  48 passed · 2 failed · 3 skipped · 0 errors
  Total time: 1.2s
```

---

## Why MCP Doctor?

The MCP ecosystem is growing fast. Servers vary wildly in quality -- some return malformed JSON-RPC, skip required schema fields, or leak environment variables in error messages. Before MCP Doctor, there was no standard way to verify compliance.

| | Manual Testing | No Testing | MCP Doctor |
|---|---|---|---|
| **Protocol coverage** | Partial, ad hoc | None | 50+ automated checks |
| **Time per run** | 30-60 min | 0 | ~2 seconds |
| **Consistency** | Varies by tester | N/A | Deterministic |
| **CI/CD ready** | No | No | Yes (JSON + exit codes) |
| **Security checks** | Usually skipped | None | Path traversal, injection, leaks |
| **Score / grade** | No | No | 0-100 score with A-F grade |

---

## Quick Start

```bash
# Test a local stdio server
npx mcpdoctor test "node my-server.js"

# Test an npm package
npx mcpdoctor test "npx @company/mcp-server"

# Test an HTTP/SSE server
npx mcpdoctor test --transport sse --url http://localhost:3001/sse

# Test with env vars
npx mcpdoctor test "node server.js" --env API_KEY=abc123

# JSON output for CI
npx mcpdoctor test "node server.js" --format json
```

---

## Features

- **50+ compliance checks** across 6 categories -- protocol, tools, resources, prompts, errors, security
- **Zero config** -- point it at any MCP server and go
- **Three transports** -- stdio, SSE, and streamable-http
- **Scoring system** -- 0-100 score with letter grades (A through F)
- **Multiple output formats** -- pretty terminal, JSON, Markdown
- **Category filtering** -- run only the checks you care about
- **CI/CD ready** -- exit code 1 on failure, JSON output for automation
- **Security testing** -- checks for env leaks, path traversal, SQL injection, command injection
- **Fast** -- full suite runs in ~2 seconds
- **No account required** -- fully local, no API keys, no telemetry

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

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed |
| `1` | One or more checks failed or errored |

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

### PR Comment with Markdown Report

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

## Project Structure

```
mcpdoctor/
  cli/          # The npx mcpdoctor CLI (published to npm)
  api/          # Optional hosted API for persistent monitoring
  site/         # mcpdoctor.ai website
```

The CLI is the primary tool. The API and site are optional components for teams that want persistent dashboards and scheduled monitoring.

---

## Contributing

Contributions are welcome. To get started:

```bash
git clone https://github.com/parallelromb/mcpdoctor.git
cd mcpdoctor/cli
npm install
npm run dev
```

To add a new check, edit `cli/src/spec.ts`. Each check is a function that receives an MCP client and returns pass/fail/skip with an optional message.

---

## Links

- **Website:** [mcpdoctor.ai](https://mcpdoctor.ai)
- **npm:** [npmjs.com/package/mcpdoctor](https://www.npmjs.com/package/mcpdoctor)
- **GitHub:** [github.com/parallelromb/mcpdoctor](https://github.com/parallelromb/mcpdoctor)

---

## License

MIT -- see [LICENSE](LICENSE) for details.

---

<div align="center">

Built by [Sri](https://github.com/parallelromb) &bull; Free and open source forever

</div>
