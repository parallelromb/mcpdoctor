# I built a free CLI tool that tests MCP servers for protocol compliance — MCP Doctor

## The problem

MCP (Model Context Protocol) is Anthropic's open standard for connecting AI tools to LLMs. It's grown to 97M+ SDK downloads/month and thousands of servers. But there's no standard way to test whether a server actually implements the protocol correctly.

I kept running into the same issues building my own MCP servers: silent failures, missing error codes, edge cases that only surfaced when a real AI client tried to use the tool. Every time I'd spend 30 minutes debugging what turned out to be a spec compliance issue.

## What I built

**MCP Doctor** — a CLI you run with `npx mcpdoctor` that tests any MCP server against 50+ compliance checks across 6 categories:

- Protocol (handshake, capabilities, JSON-RPC)
- Tools (list, call, schema validation)
- Resources (list, read, URI format)
- Prompts (list, get, arguments)
- Error handling (error codes, graceful failure)
- Security (input sanitization, path traversal)

You get a per-category score and an overall letter grade (A through F).

## Tech stack

- TypeScript
- Runs on Node 18+
- Zero config — `npx mcpdoctor --server "node my-server.js"` just works
- Supports stdio and SSE transports
- JSON output for CI/CD integration

## What I learned

1. **The MCP spec has a lot of surface area.** Writing test cases for every edge case took longer than building the test runner itself.
2. **Most community MCP servers fail at least a few checks.** Error handling is the weakest category across the board — most servers don't return proper JSON-RPC error codes.
3. **npx distribution is powerful.** Zero install friction means people actually try it.

## Current state

- Free and open source (MIT)
- GitHub: [parallelromb/mcpdoctor](https://github.com/parallelromb/mcpdoctor)
- Website: [mcpdoctor.ai](https://mcpdoctor.ai)
- Looking for feedback on which checks matter most

Would love to hear your thoughts. What would you want from a tool like this?
