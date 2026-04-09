# Discord — MCP Server (Official MCP Community)

**Built a free compliance testing CLI for MCP servers — looking for feedback**

Hey all -- I built an open-source CLI tool called **MCP Doctor** that runs 50+ compliance checks against any MCP server and grades it A through F.

It tests protocol handshake, tools/list and tools/call behavior, resources, prompts, error handling (proper JSON-RPC error codes), and basic security checks like path traversal.

**Usage:**
```bash
npx mcpdoctor --server "node my-server.js"
npx mcpdoctor --url http://localhost:3000/mcp --transport sse
```

No install needed, just npx. Supports stdio and SSE transports.

I built it because I was tired of debugging protocol issues manually every time I tested a new MCP server. Most servers handle the happy path fine but break on edge cases — especially error handling (almost nobody returns proper `-32601` / `-32602` error codes).

It's free/MIT: https://github.com/parallelromb/mcpdoctor

Would really appreciate feedback from this community on:
1. Which checks are most important to you?
2. What categories am I missing?
3. Any servers you'd want me to test it against?

Happy to answer questions about the implementation.
