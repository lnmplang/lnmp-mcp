# LNMP MCP Adapter

TypeScript + Rust WASM adapter exposing LNMP protocol tools to LLMs via the [Model Context Protocol](https://modelcontextprotocol.io/).

## Features

### Core Tools (7)
- **`lnmp.parse`** - Parse LNMP text format → structured record
- **`lnmp.encode`** - Encode record → LNMP text
- **`lnmp.decodeBinary`** - Decode binary LNMP → text
- **`lnmp.encodeBinary`** - Encode text → binary LNMP
- **`lnmp.schema.describe`** - Get semantic dictionary schema
- **`lnmp.debug.explain`** - Debug record fields
- **`lnmp.sanitize`** - Sanitize/normalize LNMP input

### Extended Tools (9 new from meta crate)
- **`lnmp.envelope.wrap`** - Add operational metadata (timestamp, source, trace_id)
- **`lnmp.network.decide`** - Route messages to LLM vs local (90%+ API call reduction)
- **`lnmp.network.importance`** - Compute message importance score (0.0-1.0)
- **`lnmp.transport.toHttp`** - Generate HTTP headers (X-LNMP-*, W3C traceparent)
- **`lnmp.transport.fromHttp`** - Parse HTTP headers to metadata
- **`lnmp.embedding.computeDelta`** - Vector delta compression (80-95% size reduction)
- **`lnmp.embedding.applyDelta`** - Apply delta to reconstruct vector
- **`lnmp.spatial.encode`** - Encode 3D positions with snapshot/delta modes
- **`lnmp.context.score`** - Score envelopes for LLM context selection

**Total**: 16 tools across 7 modules (core, envelope, network, transport, embedding, spatial, SFE)

## Quick Start

```bash
# Install dependencies
npm install

# Build Rust WASM (requires Rust + wasm32-unknown-unknown target)
cd rust
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/lnmp_wasm.wasm ../src/wasm/lnmp_wasm_bg.wasm
cd ..

# Build TypeScript
npm run build

# Run MCP server
npm start
```

## Usage Examples

### Basic Parsing
```json
{
  "tool": "lnmp.parse",
  "arguments": {
    "text": "F12=42\nF7=1"
  }
}
// → { "record": { "12": 42, "7": true } }
```

### Envelope Wrapping
```json
{
  "tool": "lnmp.envelope.wrap",
  "arguments": {
    "record": { "12": 42, "7": true },
    "metadata": {
      "timestamp": 1732373147000,
      "source": "agent-1",
      "trace_id": "abc123"
    }
  }
}
// → { "envelope": { "record": {...}, "metadata": {...} } }
```

### Intelligent Routing
```json
{
  "tool": "lnmp.network.decide",
  "arguments": {
    "message": {
      "envelope": { "record": {...}, "metadata": {...} },
      "kind": "Alert",
      "priority": 250
    }
  }
}
// → { "decision": "SendToLLM" }  // or "ProcessLocally" or "Drop"
```

### Embedding Delta Compression
```json
{
  "tool": "lnmp.embedding.computeDelta",
  "arguments": {
    "base": [0.1, 0.2, 0.3, ...],      // 1536-dim vector
    "updated": [0.1, 0.21, 0.3, ...]   // 1% change
  }
}
// → { "delta": { "changes": [{"index": 1, "delta": 0.01}], "compressionRatio": 0.95 } }
```

## Architecture

```
┌─────────┐
│   LLM   │
└────┬────┘
     │ MCP Protocol
┌────▼────────────────────────┐
│  lnmp-mcp Adapter (TS)      │
│  - 16 MCP Tools             │
│  - WASM Bindings            │
└────┬────────────────────────┘
     │ wasm-bindgen
┌────▼────────────────────────┐
│  lnmp (Rust meta crate)     │
│  - core, codec, sanitize    │
│  - envelope, net, transport │
│  - embedding, spatial, sfe  │
└─────────────────────────────┘
```

### Meta Crate Benefits
- **Single dependency**: Access to 11 LNMP modules via `lnmp` crate
- **Version consistency**: All modules guaranteed compatible
- **New capabilities**: Envelope metadata, intelligent routing, multi-protocol transport, vector deltas, spatial streaming, context scoring

## Development

### Project Structure
```
adapter/
├── src/
│   ├── bindings/lnmp.ts       # WASM bindings
│   ├── tools/                 # MCP tool definitions
│   │   ├── parse.ts           # Core tools
│   │   ├── envelope.ts        # Envelope tools
│   │   ├── networkRouting.ts  # Network routing
│   │   ├── transportHeaders.ts # Transport
│   │   ├── embeddingDelta.ts   # Embedding delta
│   │   ├── spatialStream.ts    # Spatial encoding
│   │   └── contextScore.ts     # SFE scoring
│   ├── server.ts              # MCP server setup
│   └── wasm/                  # WASM binary location
├── rust/                      # Rust WASM module
│   ├── src/lib.rs            # 13 WASM exports
│   └── Cargo.toml            # lnmp meta crate dep
└── test/                      # TypeScript tests
```

### Building from Source

**Rust WASM**:
```bash
cd rust
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/lnmp_wasm.wasm ../src/wasm/lnmp_wasm_bg.wasm
```

**TypeScript**:
```bash
npm install
npm run build
```

### Testing
```bash
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
```

## Advanced Use Cases

### Multi-Agent Coordination
```typescript
// Agent 1: Create record with metadata
const envelope = await lnmp.envelope.wrap({
  record: { 12: sensorValue },
  metadata: { timestamp: Date.now(), source: "sensor-01" }
});

// Agent 2: Decide routing
const decision = await lnmp.network.decide({
  message: { envelope, kind: "Event", priority: 100 }
});

// Agent 3: Prepare for HTTP transport
if (decision === "SendToLLM") {
  const headers = await lnmp.transport.toHttp({ envelope });
  // → { "X-LNMP-Timestamp": "...", "traceparent": "00-..." }
}
```

### Embedding Streaming
```typescript
// Update embeddings incrementally (95% bandwidth reduction)
const delta = await lnmp.embedding.computeDelta({ base, updated });
// Send delta instead of full vector (300 bytes vs 6KB)

// Receiver reconstructs
const vector = await lnmp.embedding.applyDelta({ base, delta });
```

### LLM Context Optimization
```typescript
// Rank 100 envelopes, select top 5 for context
const scored = await Promise.all(
  envelopes.map(env => lnmp.context.score({ envelope: env }))
);
const topK = scored
  .sort((a, b) => b.scores.compositeScore - a.scores.compositeScore)
  .slice(0, 5);
```

## Performance

| Operation | Latency | Notes |
|-----------|---------|-------|
| Parse text | ~0.5ms | WASM-backed |
| Envelope wrap | <1ms | Metadata injection |
| Routing decision | <1ms | ECO policy evaluation |
| Delta compute (1536-dim) | ~5ms | 1% change detection |
| Context scoring | <1ms | Freshness + importance |

**WASM binary size**: 963KB (includes 6 new modules)

## Standards Compliance

- **W3C Trace Context**: `traceparent` header generation
- **CloudEvents**: Envelope metadata alignment
- **OpenTelemetry**: Compatible trace ID format

## License

MIT - See LICENSE file

## Links

- [MCP Protocol Spec](https://modelcontextprotocol.io/)
- [LNMP Protocol](https://github.com/lnmplang/lnmp-protocol)
- [Architecture Details](./ARCHITECTURE.md)
 (TypeScript)

This package exposes LNMP parsing and encoding as an MCP provider for LLMs. It uses Rust-based LNMP core via WASM for v0.1.

Quick start
- Build or copy the Rust wasm build output into `adapter/src/wasm/lnmp_wasm_bg.wasm`.
- Run `npm run build` in `adapter/`.
- Start the MCP provider with `node dist/index.js` (or via the tests/entry).

Monorepo local build (lnmp-protocol)
1) Rust target: `rustup target add wasm32-unknown-unknown`
2) Build wasm from the monorepo crates:
```bash
cd tools/mcp/adapter/rust
cargo build --release --target wasm32-unknown-unknown
```
The output will be at `tools/mcp/adapter/rust/target/wasm32-unknown-unknown/release/lnmp_wasm.wasm`.
3) Copy or link the wasm into the TypeScript adapter:
```bash
cp target/wasm32-unknown-unknown/release/lnmp_wasm.wasm ../src/wasm/lnmp_wasm_bg.wasm
```
4) Build the JS adapter:
```bash
cd ..   # back to tools/mcp/adapter
npm install
npm run build
```
Node will consume the monorepo crates via the Rust-built wasm; no extra path hacks are needed.

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
