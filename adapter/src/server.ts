import { Server } from "@modelcontextprotocol/sdk";
import { parseTool } from "./tools/parse";
import { lnmp } from "./bindings/lnmp";
import { encodeTool } from "./tools/encode";
import { decodeBinaryTool } from "./tools/decodeBinary";
import { encodeBinaryTool } from "./tools/encodeBinary";
import { schemaDescribeTool } from "./tools/schemaDescribe";
import { debugExplainTool } from "./tools/debugExplain";
import { sanitizeTool } from "./tools/sanitize";

export function createServer(opts?: { name?: string; version?: string }) {
  // Best-effort: prefer package.json version if available
  let version = opts?.version;
  if (!version) {
    try {
      // require is fine here because tsconfig allows commonjs interop
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require('../package.json');
      version = pkg && pkg.version ? pkg.version : '0.0.0';
    } catch (e) {
      version = '0.0.0';
    }
  }
  const server = new Server({ name: opts?.name || "lnmp-mcp", version });
  server.tool(parseTool);
  server.tool(encodeTool);
  server.tool(decodeBinaryTool);
  server.tool(encodeBinaryTool);
  server.tool(schemaDescribeTool);
  server.tool(debugExplainTool);
  server.tool(sanitizeTool);
  return server;
}

export async function start(opts?: { wasmPath?: string; name?: string; version?: string; }): Promise<Server> {
  const s = createServer({ name: opts?.name, version: opts?.version });
  // Deterministically initialize LNMP WASM before allowing tools to run. This ensures tools are ready.
  try {
    if (opts && opts.wasmPath) await lnmp.initLnmpWasm({ path: opts.wasmPath }).catch(() => {});
    // lnmp.ready is a convenience wrapper that resolves when wasm is ready
    await lnmp.ready();
  } catch (err) {
    console.warn("WASM initialization failed or not available; continuing with JS fallback.", err);
  }
  try {
    await s.start();
    console.log(`MCP server started. WASM backend: ${lnmp.isWasmBacked() ? 'yes' : 'no'}`);
  } catch (err) {
    console.error('Failed to start MCP server', err);
    throw err;
  }
  return s;
}

export async function stop(srv: Server) {
  try {
    await srv.stop();
  } catch (err) {
    console.warn('Error stopping MCP server', err);
  }
}
