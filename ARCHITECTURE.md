# LNMP MCP Architecture

## Overview

The LNMP MCP Adapter is designed as a **Pure Node.js** application that bridges the Model Context Protocol (MCP) with the LNMP Rust Core via WebAssembly (WASM).

### Design Philosophy

1. **Stability First**: Removed brittle SDK dependencies in favor of a robust, minimal JSON-RPC 2.0 implementation over Stdio.
2. **Performance**: Core logic (parsing, encoding, compression) runs in WASM.
3. **Simplicity**: Single entry point (`src/index.js`) handles all tool routing.

## System Components

```mermaid
graph TD
    Client[MCP Client\n(Claude/Antigravity)] <-->|JSON-RPC Stdio| Server[Node.js Adapter\n(src/index.js)]
    Server <-->|WASM Bindings| Core[LNMP Rust Core\n(lnmp_wasm_bg.wasm)]
    
    subgraph "MCP Tools"
        Parse[lnmp_parse]
        Encode[lnmp_encode]
        Net[lnmp_network_*]
        Emb[lnmp_embedding_*]
        Etc[...]
    end
    
    Server --> Parse
    Server --> Encode
    Server --> Net
    Server --> Emb
```

## Implementation Details

### Pure Node.js Server
- Implements `initialize`, `tools/list`, `tools/call` methods manually.
- Handles Stdio streams using Node's `readline` module.
- Zero external runtime dependencies (except `dotenv`).

### WASM Integration
- Loads `lnmp_wasm_bg.wasm` at startup.
- Exposes Rust functions to JavaScript via `WebAssembly.instantiate`.
- Fallback logic ensures server runs even if WASM fails (mock/simple implementations).

## Directory Structure

```
tools/mcp/adapter/
├── src/
│   ├── index.js       # Main server implementation
│   └── wasm/          # WASM binaries
├── dist/              # Build output
└── package.json       # Minimal config
```
