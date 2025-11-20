# LNMP MCP (Management/Control Plane)

This repository contains management/control-plane utilities and services for
the LNMP ecosystem. Add tools to monitor registry, orchestrate cross-language
compliance checks, or provide coordination services.

The `adapter/` directory contains the LNMP MCP Adapter (TypeScript + WASM), which
exposes the LNMP tools to LLMs via the Model Context Protocol. See
`adapter/README.md` for quickstart and developer instructions.

This repository also contains a TypeScript LNMP MCP Adapter in `adapter/` that
exposes LNMP parsing, encoding and binary functions as MCP tools via a WASM
binding to the Rust LNMP core.

## Development flow (monorepo + standalone)
- Source of truth: develop under `lnmp-protocol/tools/mcp`. The standalone repo `lnmplang/lnmp-mcp` stays in sync via `git subtree`.
- Publish changes to the standalone repo:
  - `git remote add lnmp-mcp https://github.com/lnmplang/lnmp-mcp.git` (once)
  - `git subtree push --prefix=tools/mcp lnmp-mcp main`
- Pull updates from the standalone repo (if someone worked there): `git subtree pull --prefix=tools/mcp lnmp-mcp main --squash`
- Do not commit build artifacts (adapter/dist, adapter/node_modules, adapter/coverage, adapter/rust/target, adapter/rust/pkg); they are intentionally gitignored.

## Monorepo local build tips
- Rust WASM: `cd tools/mcp/adapter/rust && rustup target add wasm32-unknown-unknown && cargo build --release --target wasm32-unknown-unknown`
- Copy the resulting `lnmp_wasm.wasm` to the TS adapter’s expected location: `cp target/wasm32-unknown-unknown/release/lnmp_wasm.wasm ../src/wasm/lnmp_wasm_bg.wasm`
- JS side: `cd tools/mcp/adapter && npm install && npm run build`
- Rust crate paths already target the monorepo `crates/` directory; no extra symlinks needed.
