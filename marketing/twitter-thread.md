# Twitter/X Thread — MCP Doctor Launch

## Tweet 1 (Hook)
MCP servers are everywhere — 97M+ SDK downloads/month — but nobody tests them.

Most MCP servers pass the happy path and break on everything else. Bad error codes, missing capabilities, security gaps.

I built a tool to fix this. Thread:

## Tweet 2 (Problem)
The MCP spec is 50+ pages of protocol requirements. Initialize handshakes, JSON-RPC error codes, capability negotiation, resource URI formats...

Most server authors test against one client (usually Claude) and call it done.

Then it breaks in Cursor. Or with edge case inputs. Or silently.

## Tweet 3 (Solution)
MCP Doctor: a free CLI that runs 50+ compliance checks against any MCP server.

```
npx mcpdoctor --server "node my-server.js"
```

No install. No signup. No config.

Tests protocol, tools, resources, prompts, error handling, and security. Grades your server A through F.

## Tweet 4 (Demo output)
What a report looks like:

```
Protocol:  A   ✓✓✓✓✓
Tools:     B+  ✓✓✓✓✗
Resources: A   ✓✓✓
Errors:    C   ✓✗✓✗✓
Security:  A   ✓✓✓

Overall: B+  (47/53 passed)
```

Error handling is the weakest category across almost every server I've tested.

## Tweet 5 (CI/CD)
Works in CI too:

```yaml
- name: MCP compliance
  run: npx mcpdoctor --server "node dist/server.js" --fail-under B
```

Exits non-zero if the grade drops below your threshold. JSON output for parsing.

Ship MCP servers with the same confidence you ship REST APIs.

## Tweet 6 (Ecosystem context)
The MCP ecosystem has:
- Official MCP Inspector (interactive debugger)
- destilabs/mcp-doctor (lints tool descriptions)
- Various validators

None of them run a full automated compliance test suite against the spec.

MCP Doctor fills that gap.

## Tweet 7 (CTA)
MCP Doctor is free, open source, MIT licensed.

GitHub: github.com/parallelromb/mcpdoctor
Website: mcpdoctor.ai

Try it: `npx mcpdoctor --server "node your-server.js"`

If you're building MCP servers, I'd love your feedback. What checks matter most?
