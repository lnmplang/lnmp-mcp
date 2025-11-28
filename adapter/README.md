# LNMP MCP Adapter

This adapter exposes the **LNMP Protocol** capabilities to AI agents via the **Model Context Protocol (MCP)**.

It uses a **Pure Node.js** implementation with **WASM** bindings for high performance and stability, without external SDK dependencies.

## 🚀 Features

- **16 MCP Tools**: Full coverage of LNMP capabilities
- **Zero SDK Dependency**: Pure JSON-RPC 2.0 over Stdio implementation
- **WASM Powered**: Core logic runs in Rust-compiled WebAssembly
- **Universal Compatibility**: Works with Claude Desktop, Antigravity, and any MCP client

## 🛠️ Tools List

### Core Protocol
- `lnmp_parse`: Parse LNMP text to JSON
- `lnmp_encode`: Encode JSON to LNMP text
- `lnmp_decode_binary`: Decode binary LNMP
- `lnmp_encode_binary`: Encode to binary LNMP
- `lnmp_schema_describe`: Get schema info
- `lnmp_debug_explain`: Explain LNMP structure
- `lnmp_sanitize`: Sanitize input

### Advanced Features
- **Envelope**: `lnmp_envelope_wrap` (Metadata wrapping)
- **Network**: `lnmp_network_decide`, `lnmp_network_importance` (Routing & Scoring)
- **Transport**: `lnmp_transport_to_http`, `lnmp_transport_from_http` (Headers)
- **Embedding**: `lnmp_embedding_delta`, `lnmp_embedding_apply_delta` (Vector compression)
- **Spatial**: `lnmp_spatial_encode` (3D streaming)
- **Context**: `lnmp_context_score` (Relevance scoring)

## 📦 Installation

```bash
cd tools/mcp/adapter
npm install
npm run build
```

## 🔌 Configuration

### Antigravity / Claude Desktop

Add to your MCP config:

```json
{
  "mcpServers": {
    "lnmp": {
      "command": "node",
      "args": ["/absolute/path/to/lnmp-protocol/tools/mcp/adapter/dist/index.js"]
    }
  }
}
```

## 🏗️ Architecture

- **src/index.js**: Main entry point (Pure Node.js server)
- **src/wasm/**: Rust-compiled WASM binary
- **dist/**: Distribution files

## 🧪 Testing

You can test manually using the MCP Inspector or by running:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```
