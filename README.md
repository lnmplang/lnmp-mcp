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
