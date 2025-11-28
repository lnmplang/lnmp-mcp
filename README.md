# LNMP MCP Workspace

This directory hosts every management/control-plane component for the LNMP protocol plus the LNMP **Model Context Protocol (MCP) Adapter** that exposes LNMP tooling to LLM agents. The tree is designed to work both inside the `lnmp-protocol` monorepo and as the standalone `lnmplang/lnmp-mcp` repository via `git subtree`.

```
tools/mcp/
├── adapter/              # TypeScript MCP provider + WASM bindings
│   ├── src/              # MCP tools, bindings, CLI + HTTP shim
│   ├── dist/             # Compiled JS (generated)
│   ├── wasm/             # Published WASM artifacts
│   ├── test/             # Jest suites for every MCP tool
│   └── rust/             # Rust crate compiled to wasm32-unknown-unknown
├── ARCHITECTURE.md       # In-depth engineering spec for the adapter
├── README.md             # This file
└── pyproject.toml        # Python helper package scaffold (future MCP helpers)
```

## What the MCP Adapter Provides

The adapter exposes the full LNMP meta-crate surface as MCP tools so agents can parse, encode, sanitize, envelope, route, transport, and analyze LNMP records without linking Rust directly. Key tool families:

| Module            | Tools (MCP names)                                  | Highlights                                  |
|-------------------|----------------------------------------------------|---------------------------------------------|
| Core codec        | `lnmp.parse`, `lnmp.encode`, `lnmp.decodeBinary`, `lnmp.encodeBinary`, `lnmp.schema.describe`, `lnmp.debug.explain`, `lnmp.sanitize` | Strict/lenient parsing, binary codecs, schema inspection, sanitizer |
| Envelope & net    | `lnmp.envelope.wrap`, `lnmp.network.decide`, `lnmp.network.importance` | Operational metadata + routing heuristics   |
| Transport         | `lnmp.transport.toHttp`, `lnmp.transport.fromHttp` | X-LNMP headers + W3C traceparent bridging   |
| Embedding         | `lnmp.embedding.computeDelta`, `lnmp.embedding.applyDelta` | Incremental vector updates with 80–95% compression |
| Spatial           | `lnmp.spatial.encode`                              | Snapshot/delta compression for position streams |
| Context scoring   | `lnmp.context.score`                               | Freshness + importance scoring for LLM context |

Each tool has a TypeScript wrapper (`adapter/src/tools/*.ts`) plus Jest coverage (`adapter/test/tools/*.test.ts`).

## Getting Started

1. **Install dependencies**
   ```bash
   cd tools/mcp/adapter
   npm install
   ```

2. **Build the Rust WASM once**
   ```bash
   cd rust
   rustup target add wasm32-unknown-unknown
   wasm-pack build --target nodejs --out-dir ../src/wasm --release
   cd ..
   ```
   This populates `adapter/src/wasm` and `adapter/wasm` with `lnmp_wasm_bg.wasm` plus the JS glue.

3. **Compile the TypeScript adapter**
   ```bash
   npm run build
   ```

4. **Run the MCP test suite**
   ```bash
   npm test
   ```
   This executes unit tests for every tool plus the integration HTTP harness.

5. **Try the HTTP shim (useful for quick manual checks)**
   ```bash
   node dist/http_server.js
   # or npm run start:server
   ```
   Endpoints include `/parse`, `/encbin`, `/decbin`, `/schema`, `/explain`, `/sanitize`, and admin endpoints for toggling strict parsing.

6. **Invoke tools directly**
   ```bash
   node - <<'NODE'
   const { lnmp } = require('./dist/bindings/lnmp.js');
   (async () => {
     await lnmp.initLnmpWasm({ path: __dirname + '/dist/wasm/lnmp_wasm_bg.wasm' }).catch(() => {});
     await lnmp.ready();
     const parsed = lnmp.parse('F7=1\nF12=14532');
     console.log(parsed);
   })();
   NODE
   ```

## Developing the Adapter

- **Rust changes** live in `adapter/rust/src/lib.rs`. Any change requires rebuilding the WASM via `wasm-pack` (see step 2 above). The compiled outputs (`src/wasm`, `wasm`, `dist/wasm`) must be refreshed before packaging.
- **TypeScript tools** are in `adapter/src/tools`. Add new tools here, update `adapter/src/server.ts`, and create matching Jest tests.
- **Bindings**: If the WASM ABI changes, update `adapter/src/bindings/lnmp.ts` so new exports are surfaced.
- **Testing**: `npm test` runs all suites; `npm run test:unit` or `npm run test:integration` are available for finer granularity.
- **Packaging**: `npm pack` (or `npm publish`) relies on the `prepack` script, which rebuilds both TypeScript and (by default) reminds you to copy the WASM artifact. If the WASM is already built/copied, packaging will include it automatically.

## Synchronizing with the Standalone Repo

The monorepo version is authoritative. Use `git subtree` to keep `lnmplang/lnmp-mcp` in sync:

- **Push from monorepo to standalone**
  ```bash
  git remote add lnmp-mcp https://github.com/lnmplang/lnmp-mcp.git   # once
  git subtree push --prefix=tools/mcp lnmp-mcp main
  ```

- **Pull standalone changes back into the monorepo**
  ```bash
  git subtree pull --prefix=tools/mcp lnmp-mcp main --squash
  ```

Avoid checking in generated directories (`adapter/dist`, `adapter/node_modules`, `adapter/coverage`, `adapter/rust/target`, `adapter/rust/pkg`). The published tarball already carries the compiled `dist` and `wasm` assets so end users can install the package without Rust.

## FAQ

- **How do I change strict vs lenient parsing defaults?** Use the `lnmp.setParseFallback(boolean)` helper or the HTTP admin endpoints (`/admin/setParseFallback`). Individual tool calls can pass `{ strict: true }` or `{ mode: "strict" }`.
- **Do I need Rust installed to use the adapter?** No for consumers (prebuilt WASM ships in `wasm/`). Yes for developers when making changes to `adapter/rust`.
- **Can this run outside Node?** The adapter targets Node (MCP SDK). Browser/Bun support is possible but requires different WASM loaders and is not yet tested.

For deeper architectural details (state diagrams, WASM glue, MCP manifest), read `ARCHITECTURE.md`. Let us know via issues/PRs if you add new LNMP modules or MCP tooling that should be documented here. Happy hacking!
