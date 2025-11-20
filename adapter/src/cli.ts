#!/usr/bin/env node
/* CLI entrypoint for the LNMP MCP Adapter — starts the server */
import { start } from './server';
import { startHttpServer } from './http_server';
import { lnmp } from './bindings/lnmp';

function parseArgValue(argName: string): string | undefined {
  const arg = process.argv.find(a => a.startsWith(`--${argName}=`));
  if (arg) return arg.split('=')[1];
  return undefined;
}

async function main() {
  const portArg = parseArgValue('port') || process.env.PORT;
  if (portArg) process.env.PORT = String(Number(portArg) || portArg);
  try {
    // Try to initialize the WASM (best-effort)
    await lnmp.initLnmpWasm({ path: __dirname + '/wasm/lnmp_wasm_bg.wasm' }).catch(() => {});
    await lnmp.ready();
  } catch (ex) {
    console.warn('WASM init failed, continuing with fallback:', ex);
  }
  // Start the REST HTTP wrapper for easier dev testing; the HTTP wrapper will start the MCP server
  const http = await startHttpServer(Number(process.env.PORT) || undefined);
  console.log('Server started (via CLI).');
  // Keep process alive while server runs
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to start server from CLI:', err);
    process.exit(1);
  });
}

export default main;
