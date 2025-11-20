import http from 'http';
import url from 'url';
import { createServer } from './server';
import { lnmp } from './bindings/lnmp';
import { parseTool } from './tools/parse';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { encodeTool } from './tools/encode';
import { encodeBinaryTool } from './tools/encodeBinary';
import { decodeBinaryTool } from './tools/decodeBinary';
import { schemaDescribeTool } from './tools/schemaDescribe';
import { debugExplainTool } from './tools/debugExplain';
import { sanitizeTool } from './tools/sanitize';

function getJSONBody(req: http.IncomingMessage) {
  return new Promise<any>((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = data ? JSON.parse(data) : {};
        resolve(parsed);
      } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

export async function startHttpServer(portArg?: number): Promise<{ server: http.Server; port: number; stop: () => Promise<void>; }> {
  await lnmp.initLnmpWasm({ path: __dirname + '/wasm/lnmp_wasm_bg.wasm' }).catch(() => {});
  await lnmp.ready();
  const s = createServer();
  await s.start();
  const port = (portArg !== undefined && portArg !== null) ? Number(portArg) : (process.env.PORT ? Number(process.env.PORT) : 8080);
  const server = http.createServer(async (req, res) => {
    const { pathname, query } = url.parse(req.url || '', true);
    try {
      if (req.method === 'POST' && pathname === '/parse') {
        const body = await getJSONBody(req);
        const r = await (parseTool as any).handler({ text: body.text, strict: !!body.strict, mode: body.mode });
        return res.end(JSON.stringify(r));
      }
      if (req.method === 'POST' && pathname === '/encode') {
        const body = await getJSONBody(req);
        const r = await (encodeTool as any).handler({ record: body.record });
        return res.end(JSON.stringify(r));
      }
      if (req.method === 'POST' && pathname === '/encbin') {
        const body = await getJSONBody(req);
        const r = await (encodeBinaryTool as any).handler({
          text: body.text,
          mode: body.mode,
          sanitize: body.sanitize,
          sanitizeOptions: body.sanitizeOptions,
        });
        return res.end(JSON.stringify(r));
      }
      if (req.method === 'POST' && pathname === '/decbin') {
        const body = await getJSONBody(req);
        const r = await (decodeBinaryTool as any).handler({ binary: body.binary });
        return res.end(JSON.stringify(r));
      }
      if ((req.method === 'GET' || req.method === 'POST') && pathname === '/schema') {
        const mode = (req.method === 'GET') ? query.mode || 'full' : (await getJSONBody(req)).mode || 'full';
        const r = await (schemaDescribeTool as any).handler({ mode });
        return res.end(JSON.stringify(r));
      }
      if (req.method === 'POST' && pathname === '/explain') {
        const body = await getJSONBody(req);
        const r = await (debugExplainTool as any).handler({ text: body.text });
        return res.end(JSON.stringify(r));
      }
      if (req.method === 'POST' && pathname === '/sanitize') {
        const body = await getJSONBody(req);
        const r = await (sanitizeTool as any).handler({ text: body.text, options: body.options || body.sanitizeOptions });
        return res.end(JSON.stringify(r));
      }
      if (req.method === 'POST' && pathname === '/admin/setParseFallback') {
        const body = await getJSONBody(req);
        if (typeof body.fallback === 'boolean') {
          lnmp.setParseFallback(body.fallback);
          return res.end(JSON.stringify({ ok: true, fallback: body.fallback }));
        }
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'fallback should be boolean' }));
      }
      if ((req.method === 'GET' || req.method === 'POST') && pathname === '/admin/getParseFallback') {
        return res.end(JSON.stringify({ fallback: lnmp.getParseFallback() }));
      }
      if ((req.method === 'GET' || req.method === 'POST') && pathname === '/admin/getWasmBacked') {
        return res.end(JSON.stringify({ wasm: !!lnmp.isWasmBacked() }));
      }
      if ((req.method === 'GET' || req.method === 'POST') && pathname === '/admin/stats') {
        return res.end(JSON.stringify(lnmp.getStats()));
      }
      if (req.method === 'POST' && pathname === '/admin/parseStrict') {
        const body = await getJSONBody(req);
        const prev = lnmp.getParseFallback();
        lnmp.setParseFallback(false);
        try {
          const rec = lnmp.parse(body.text);
          lnmp.setParseFallback(prev);
          return res.end(JSON.stringify({ record: rec }));
        } catch (err: any) {
          lnmp.setParseFallback(prev);
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: err.message || String(err), code: err.code, details: err.details }));
        }
      }
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'not found' }));
    } catch (err: any) {
      console.error('Handler error:', err);
      const out = { error: err.message || String(err), code: err && err.code ? err.code : undefined, details: err && err.details ? err.details : undefined };
      res.statusCode = 500;
      return res.end(JSON.stringify(out));
    }
  });
  server.listen(port, () => {
    const addr = server.address();
    const boundPort = (addr && typeof addr === 'object' && 'port' in (addr as any)) ? (addr as any).port : port;
    console.log(`HTTP test server running on http://localhost:${boundPort}`);
    // write pid file for stop helper
    try {
      const pidFile = path.join(os.tmpdir(), 'lnmp_http_server.pid');
      fs.writeFileSync(pidFile, String(process.pid));
    } catch (err) {
      // ignore
    }
  });
  const addr = server.address();
  const boundPort = (addr && typeof addr === 'object' && 'port' in (addr as any)) ? (addr as any).port : port;
  return { server, port: boundPort, stop: async () => { server.close(); await s.stop(); } };
}

export async function runStandalone() {
  await startHttpServer();
}

if (require.main === module) runStandalone().catch((e) => { console.error('Failed to run http server', e); process.exit(1); });
