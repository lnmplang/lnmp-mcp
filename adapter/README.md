# LNMP MCP Adapter (TypeScript)

This package exposes LNMP parsing and encoding as an MCP provider for LLMs. It uses Rust-based LNMP core via WASM for v0.1.

Quick start
- Build or copy the Rust wasm build output into `adapter/src/wasm/lnmp_wasm_bg.wasm`.
- Run `npm run build` in `adapter/`.
- Start the MCP provider with `node dist/index.js` (or via the tests/entry).

Quickstart SDK
1) Install the adapter (or run locally):
```bash
npm install --save @lnmplang/lnmp-mcp
```
2) Use the SDK:
```ts
import { lnmp } from '@lnmplang/lnmp-mcp';
await lnmp.ready();
const rec = lnmp.parse('F7=1\nF12=14532');
console.log(rec);
// For LLM outputs, sanitize and encode leniently:
const { text: safe } = lnmp.sanitize('F1=1\nF2=Hello "world"');
const bin = lnmp.encodeBinary(safe, { mode: 'lenient', sanitize: false });
```

Example demo and development server
```bash
node dist/examples/demo/agent.js
```

LLM-Driven Demo
----------------
There's a small rule-based LLM simulation that showcases an LLM-in-the-loop using the MCP HTTP wrapper in `examples/demo/agent_mcp_llm.ts`.
It demonstrates the following flow: LLM -> MCP (/parse) -> MCP (/explain) -> MCP (/encbin) -> MCP (/decbin) -> LLM parse/analysis.

Run it locally with:
```bash
cd adapter
npx ts-node ./examples/demo/agent_mcp_llm.ts
```

Running the local HTTP test server (development)
------------------------------------------------
Prefer using npm scripts to start the local HTTP test server. This avoids relying on .sh scripts and provides a cross-platform developer experience.

Start the server in production-like mode:
```bash
npm run start:server
```

Start the server with auto-reload for development:
```bash
npm run dev
# or npm run dev:server
```

The `dev` script uses Node's `--watch` to restart the server automatically on file changes. This requires Node 18+; if you'd prefer TS-aware dev-server (server recompile & restart), add `ts-node-dev` in your environment and use an alternative command.
 - If using `pnpm`, the same npm scripts are available, for example: `pnpm run dev` or `pnpm run start:server`.

Admin endpoints and per-request strict parsing
------------------------------------------------
The adapter ships with a tiny HTTP wrapper for local testing which exposes the MCP tools via simple REST endpoints. When running the script `scripts/run_http_server.js` the following endpoints are available by default:

- POST /parse — parse LNMP text. Payload: `{ "text": "F7=1", "strict": true|false, "mode": "strict"|"lenient" }`. When `strict` is true, a parsing failure returns HTTP 500 and a structured JSON error (code, message, details). When omitted or `false`, invalid inputs fall back to the JS parser and return an empty record `{ record: {} }`.
- POST /encode — encode a parsed LNMP record back to text. Payload: `{ "record": { ... } }`.
- POST /encbin — encode text to binary (base64) with `encbin`. Payload supports `{ "mode": "lenient"|"strict", "sanitize": true|false, "sanitizeOptions": { ... } }` to repair LLM outputs before encoding.
- POST /decbin — decode binary text (base64) back to LNMP text.
- GET/POST /schema — returns a schema description (full or compact mode).
- POST /explain — returns debugging explanation of a record.
- POST /sanitize — runs the sanitizer (quote/escape repair) and returns `{ text, changed }`.

Admin endpoints:
- POST /admin/setParseFallback — toggles global fallback behavior. Body: `{ "fallback": true|false }`.
- GET  /admin/getParseFallback — returns current fallback value: `{ "fallback": true|false }`.
- GET /admin/getWasmBacked — returns whether the server is using the wasm-backed parser: `{ "wasm": true|false }`.
- GET /admin/stats — returns simple counters: `{ "fallbackCount": <number>, "wasmErrorCount": <number> }` that help detect how often fallback was used or wasm errors occurred.

Notes
- LLM/agent-to-agent flows should run text through `lnmp.sanitize` (or set `mode: "lenient"` on encodeBinary) to repair quotes/escapes before strict parsing.
- The `strict` field provides per-request enforcement, so you don't need to change global state to try strict parsing behavior.
- For production systems, the HTTP wrapper is intended as a local test harness only; proper MCP transports should be used in deployment.


Usage Example
1) Install the adapter as an MCP provider (when published):
```
npx mcp-client install lnmp-mcp
```
2) Once the provider is started, tools can be invoked from LLMs: e.g.
`"Use lnmp.parse to parse: F7=1 F12=14532"` — the LLM will call the `lnmp.parse` tool.

Development Notes
- The WASM build artifact is not checked in. To produce it, change to `adapter/rust/` and run `wasm-pack build`.
- If you're developing without a local Rust toolchain, a fallback pure JS parser is available in `bindings/lnmp.ts` for testing only.


See `ARCHITECTURE.md` for full details.
