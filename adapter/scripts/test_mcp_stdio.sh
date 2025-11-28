#!/bin/bash
# Quick test script for MCP stdio server

echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node dist/mcp_stdio.js &
PID=$!
sleep 2
kill $PID 2>/dev/null
