# LNMP MCP LLM-driven demo

This example demonstrates a minimal LLM-in-the-loop workflow that calls LNMP MCP tools via the adapter HTTP server endpoints.

What it shows:
- LLM parses an LNMP string using `lnmp.parse` via `/parse` endpoint
- LLM asks for a human-friendly explanation via `lnmp.debug.explain` (`/explain`)
- LLM requests binary encoding via `lnmp.encodeBinary` (`/encbin`), then decodes it back (`/decbin`)

How to run:

1. From the root of the repo, change to the adapter folder:

```bash
cd adapter
```

2. Run the demo script using `npx ts-node` so the TypeScript runs in-place (no build step required):

```bash
npx ts-node ./examples/demo/agent_mcp_llm.ts
```

The demo will start the HTTP server (listening on a random available port), simulate an LLM planning steps and call the MCP tools, then print the results and stop the server.

Notes:
- This is a demo; the LLM is a small rule-based mock function to demonstrate the interaction loop.
- To adapt this for a real LLM, replace the `llmThinkStep` function with calls into your LLM provider (e.g., OpenAI, local LLM) and use the server endpoints for tool execution.

Production agent (OpenAI)
-------------------------
To run a production-like agent that uses the OpenAI API to decide which tools to call (multi-step):

```bash
export OPENAI_API_KEY=sk-XXX
cd adapter
npx ts-node ./examples/demo/agent_mcp_openai.ts
```

This agent is an example that demonstrates real LLM integrations with the MCP tool endpoints. It will call `/schema`, `/parse`, `/explain`, `/encbin` and `/decbin` as requested by the LLM.

Using a .env file (recommended):
1. Copy `.env.example` to `.env` in the `adapter/` folder and put your `OPENAI_API_KEY` there.
2. Run the helper script (recommended) which sources `.env` and executes the demo:

```bash
cd adapter
chmod +x ./scripts/run_openai_demo.sh
./scripts/run_openai_demo.sh
```

Note: `.env` should not be committed to git; we provide `.env.example` to demonstrate format.
