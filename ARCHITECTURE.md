# LNMP-MCP Adapter — Architecture and Engineering Specification.

Version: Draft 1.0

This document provides a full engineering specification, including a minimal TypeScript-based adapter, WASM binding guidance, MCP manifest, and CI pipeline advice.

## Purpose

The LNMP–MCP adapter transforms the LNMP format into MCP tools that LLMs can call. It should expose text parsing, text encoding, binary decode/encode, schema description, and a debug/explain tool so LLMs can fully understand LNMP records and leverage LNMP features (semantic checksums, nested structures, etc.).

## Goals & Non-Goals
Goals:
- Provide an easy-to-install MCP tool provider in TypeScript (Node.js/Bun/Deno).
- Expose LNMP parsing and encoding operations in an ergonomic tool API.
- Serve WASM bindings from Rust LNMP core for reliable parsing and binary codec handling.
Non-Goals (Draft 1.0):
- Implement Node native NAPI bindings (planned for v0.2).
- Provide a full schema registry (v0.3+).

## High-Level Architecture

LLM (GPT / Claude / Gemini) → Model Context Protocol (MCP) → lnmp-mcp adapter (TS) → lnmp-core (Rust) via WASM or NAPI

- The adapter is implemented in TypeScript and runs as an MCP provider.
- The core LNMP logic and codec lives in Rust; exported via WASM for v0.1.
- Optional NAPI for high-performance v0.2+.

## Repository Layout for TypeScript Adapter (Adapter only)

lnmp-mcp/
 ├── adapter/                    # TypeScript adapter package
 │    ├── package.json
 │    ├── tsconfig.json
 │    ├── src/
 │    │   ├── index.ts
 │    │   ├── server.ts
 │    │   ├── tools/
 │    │   │   ├── parse.ts
 │    │   │   ├── encode.ts
 │    │   │   ├── decodeBinary.ts
 │    │   │   ├── encodeBinary.ts
 │    │   │   ├── schemaDescribe.ts
 │    │   │   └── debugExplain.ts
 │    │   ├── bindings/
 │    │   │   └── lnmp.ts  # TypeScript wrapper around wasm-bindgen JS
 │    │   └── wasm/         # The WASM file produced by the Rust build (not checked in)
 │    │       └── lnmp_wasm_bg.wasm
 │    └── MCP.json
 ├── rust/                      # optional: rust build for WASM, only for adapter workspace
 └── ARCHITECTURE.md            # This file

## MCP Tool API Design

Define JSON schemas for tool inputs/outputs and follow MCP SDK conventions.

1) lnmp.parse
- Input: { text: string }
- Output: { record: Record<string, number | string | boolean | string[]> }

2) lnmp.encode
- Input: { record: Record<string, any> }
- Output: { text: string }

3) lnmp.decodeBinary
- Input: { binary: string (base64) }
- Output: { text: string }

4) lnmp.encodeBinary
- Input: { text: string }
- Output: { binary: string (base64) }

5) lnmp.schema.describe
- Input: { mode: "full" | "compact" }
- Output: { fields: Record<string, string> }

6) lnmp.debug.explain
- Input: { text: string }
- Output: { explanation: string }

## TypeScript Adapter Implementation

Implementation notes and patterns:

- Use the official MCP SDK for Node.js: `@modelcontextprotocol/sdk`.
- Tools should declare inputSchema / outputSchema and async handlers.
- Load WASM module at startup: `bindings/lnmp.ts` will export a `loadWasm(bytes|path)` initializer.
- Prefer `wasm-pack` with `--target nodejs`, or `wasm-bindgen` to produce a JS glue file and .wasm file.
- Adapter server: `src/server.ts` registers tools and runs the MCP server.

The adapter exposes a deterministic WASM initialization:
- `initLnmpWasm(options?)`: A single entrypoint to initialize the wasm module. Uses `LNMP_WASM_PATH` env var override and supports `bytes` or a `path`.
- `lnmp.ready()`: A promise that resolves once wasm initialization completes. `server.start()` should await this to guarantee all tools are ready.

This ensures robust and deterministic startup across dev, CI, and deploy environments.

Example skeleton `server.ts`:

```ts
import { Server } from "@modelcontextprotocol/sdk";
import { parseTool } from "./tools/parse";

const server = new Server({ name: "lnmp-mcp", version: "0.1.0" });
server.tool(parseTool);
server.start();
```

### Bindings — `bindings/lnmp.ts` (Loader)

- Provide a typed wrapper for all exported functions from WASM: `parse`, `encode`, `encode_binary`, `decode_binary`, `schema_describe`, `debug_explain`.
- Expose initialization function that accepts either a file path or Buffer/ArrayBuffer so calling code can load from disk or CDN.

### Tool Implementations

Each tool simply calls into `bindings/lnmp` and performs input validation.

Example `parse.ts`:

```ts
import { parse } from "../bindings/lnmp";
export const parseTool: Tool = {
  name: "lnmp.parse",
  handler: async ({ text }) => ({ record: parse(text) })
};
```

## WASM Build (Rust) — Guidelines

- Provide a Rust crate at `rust/` that exposes the core functions via `wasm_bindgen`.
- Build commands:
  - `cargo build --target wasm32-unknown-unknown --release` followed by `wasm-bindgen` to produce JS glue.
  - Alternatively use `wasm-pack build --target nodejs`.

Example `lib.rs` will export parse, encode, encode_binary, decode_binary, schema_describe, debug_explain as described in the draft.

## CI / Release Pipeline

Suggested GitHub Actions jobs:
- `build:rust-wasm` — Build Rust crate, run wasm-opt.
- `build:ts` — Install Node deps, compile TypeScript.
- `test` — Unit tests for TS and simple wasm-based tests.
- `publish` — Publish to npm on tagged releases.

## Security & Hardening

- Validate input shapes against JSON Schema before passing to WASM.
- Avoid executable code injection via record fields — treat all record field values as untrusted.
- Use CI to scan wasm binaries and lock file checks.

## Observability & Monitoring

- Expose metrics (parsing latency, error rates) via Prometheus-compatible handler.
- Add structured logs for tool calls and errors.

## Roadmap (v0.1–v1.0)
v0.1 -> WASM, basic tools, TypeScript MCP provider, sample clients.
v0.2 -> NAPI binding, streaming updates.
v0.3 -> Schema registry and automatic LLM correction.
v1.0 -> Production-grade provider, binaries for multiple platforms, full SDK alignment.

## Development Checklist (v0.1)
- Add adapter TypeScript package.
- Build basic MCP server and tool handlers that call into wasm loader.
- Provide demos and usage README.
- Add CI to build WASM and TypeScript.

## Appendix — Example JSON Schemas for Tools
_Included as part of the repo in `adapter/`_.

---
This specification is a strongly opinionated starting point to implement the lnmp-mcp product in TypeScript while keeping the Rust LNMP core as the authoritative implementation.

## Acceptance Criteria (v0.1)
1) Tools listed in `MCP.json` are all implemented and registered in the TypeScript server.
2) Tools behave as documented in the tool JSON schemas and return validated outputs.
3) WASM binding loads at startup when built; if no wasm present, fallback to a safe JS parser.
4) CI builds and tests both Rust and TypeScript components and copies artifacts where necessary.
5) Documentation contains build and usage instructions and a demo client.

## API Contract (Detailed)
All tool handlers accept a JSON object and return a JSON object. Tools must validate inputs using the schemas in `adapter/specs/tool-schemas.json`.

Examples:

lnmp.parse
Input: { "text":"F7=1\nF12=14532" }
Output: { "record": { "7": true, "12": 14532 } }

lnmp.encode
Input: { "record": { "7": true, "12": 14532 } }
Output: { "text": "F7=1\nF12=14532" }

lnmp.encodeBinary
Input: { "text": "F7=1\nF12=14532" }
Output: { "binary": "<base64>" }

lnmp.decodeBinary
Input: { "binary": "<base64>" }
Output: { "text": "F7=1\nF12=14532" }

lnmp.schema.describe
Input: { "mode": "full" }
Output: { "fields": { "7": "boolean", "12": "int" } }

lnmp.debug.explain
Input: { "text": "F7=1 F12=14532" }
Output: { "explanation": "F7=1    # is_active\nF12=14532    # user_id" }

## Error Model & Monitoring
- Tools should return HTTP 4xx error codes for invalid inputs, and 5xx for internal errors (WASM or code errors).
- Wrap tool handlers with a small middleware in the MCP server to log errors and sanitize stack traces.
- For wasm timeouts, consider a watchdog that aborts long-running JS/WASM calls.

## Binary Format (Base64 Canonicalization)
- The encodeBinary tool returns a base64-encoded representation of the binary buffer.
- The decodeBinary tool accepts either base64 string or a raw binary buffer; the TypeScript binding will coerce base64 to a buffer.

## Build & Release — Detailed Steps (CI)
1) Build Rust WASM with `wasm-pack build --release --target nodejs`.
2) Run wasm-opt on the output to reduce size (optional): `wasm-opt -Oz pkg/package_bg.wasm -o pkg/package_bg.wasm`.
3) Copy the wasm and JS glue into `adapter/src/wasm/`.
4) Run `npm ci && npm run build` in `adapter/`.
5) Run unit tests in `adapter/`.
6) Create npm package and publish as `@lnmplang/lnmp-mcp` on bump/tag.

## Security Considerations & Policy
- Validate all input with JSON Schema.
- Never pass untrusted input to an eval or similar code path.
- Strip sensitive fields from logs and disable debug explanations in production by default.

## Testing & QA
- Unit tests for JS fallback parser and tool handlers.
- A small e2e test that builds Wasm, runs the adapter server, and calls each tool via a client (or with direct handler calls).
- Example of edge cases: deeply nested structures, large binary data, invalid lines, additional fields.

## Developer Onboarding
To develop the TypeScript adapter locally:
1) Install Node.js 20+, Rust toolchain and `wasm-pack`.
2) Build the WASM: `cd adapter/rust && wasm-pack build --target nodejs`.
3) Copy the wasm to the adapter: `cp adapter/rust/pkg/*.wasm adapter/src/wasm/`.
4) Build and run the adapter: `cd adapter && npm install && npm run build && npm start`.

## Next Steps for v0.2 and beyond
- Add NAPI binding for performance-sensitive workloads.
- Streaming APIs for very large LNMP messages / streaming logs.
- Schema registry integration with MCP service so model sees accurate schemas.

---
If you'd like, I can:
- Add TypeScript unit tests that validate each tool's schema conformance.
- Add gh actions job to publish artifacts or to tag releases.
- Add additional sample MCP client to demonstrate how an LLM calls the tool.

