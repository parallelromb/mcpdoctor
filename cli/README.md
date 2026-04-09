# mcpdoctor

Compliance testing CLI for MCP (Model Context Protocol) servers. Runs 50+ checks across protocol, tools, resources, prompts, error handling, and security categories.

## Quick Start

```bash
npx mcpdoctor test "node my-server.js"
```

## Installation

```bash
# Run directly with npx (no install)
npx mcpdoctor test "node server.js"

# Or install globally
npm install -g mcpdoctor
mcpdoctor test "node server.js"
```

## CLI Reference

```
mcpdoctor test <command> [options]

Arguments:
  command              Server command to test (e.g., "node server.js")

Options:
  --transport <type>   Transport type: stdio (default), sse, streamable-http
  --url <url>          Server URL (for sse/http transports)
  --env <key=value>    Environment variables (can repeat)
  --timeout <ms>       Per-check timeout in ms (default: 10000)
  --format <type>      Output format: pretty (default), json, markdown
  --category <cat>     Only run checks in this category
  --verbose            Show detailed output for each check
  --version            Show version
  --help               Show help
```

## Examples

### Test a local server

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

### Run only protocol checks

```bash
mcpdoctor test "node server.js" --category protocol
```

### JSON output for CI

```bash
mcpdoctor test "node server.js" --format json > report.json
```

### Markdown report for PRs

```bash
mcpdoctor test "node server.js" --format markdown > report.md
```

### Verbose output (show failure details)

```bash
mcpdoctor test "node server.js" --verbose
```

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
  ...

  TOOLS
  ✓ tools/list Returns Valid Array                     8ms
  ✓ Tool Schema Has Required Fields                    3ms
  ...

  ──────────────────────────────────────────
  Score: 92/100 (A)

  48 passed · 2 failed · 3 skipped · 0 errors
  Total time: 1.2s
```

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
            echo "Score below threshold (80)"
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

## Check Categories

| Category | Checks | Description |
|----------|--------|-------------|
| protocol | 10 | Initialize handshake, JSON-RPC compliance, error codes |
| tools | 10 | Tool listing, schemas, calls, content format |
| resources | 8 | Resource listing, URIs, reading, templates |
| prompts | 7 | Prompt listing, arguments, messages |
| error_handling | 8 | Timeouts, malformed input, concurrency |
| security | 7 | Env leak detection, path traversal, injection |

## Exit Codes

- `0` — All checks passed (no failures or errors)
- `1` — One or more checks failed or errored

## Links

- Website: [mcpdoctor.ai](https://mcpdoctor.ai)
- GitHub: [github.com/parallelromb/mcpdoctor](https://github.com/parallelromb/mcpdoctor)

## License

MIT
