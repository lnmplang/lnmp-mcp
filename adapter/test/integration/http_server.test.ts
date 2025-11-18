/* eslint-disable no-console */
import { spawn } from 'child_process';

const waitForServerStart = (proc: any, timeout = 5000): Promise<number> => {
  return new Promise((resolve, reject) => {
    let started = false;
    const t = setTimeout(() => {
      if (!started) {
        reject(new Error('Timed out waiting for server to start'));
        proc.kill();
      }
    }, timeout);
    proc.stdout?.on('data', (chunk: Buffer) => {
      const s = String(chunk);
      const matches = /HTTP test server running on http:\/\/localhost:(\d+)/.exec(s);
      if (matches) {
        started = true;
        clearTimeout(t);
        resolve(Number(matches[1]));
      }
    });
    proc.on('exit', (code: number) => {
      if (!started) reject(new Error('Server exited prematurely with code ' + code));
    });
  });
};

describe('HTTP wrapper integration', () => {
  jest.setTimeout(20000);
  let proc: any;
  let port: number;

  beforeAll(async () => {
    // Start server on ephemeral port 0
    proc = spawn(process.execPath, ['scripts/run_http_server.js'], {
      cwd: __dirname + '/../../',
      env: { ...process.env, PORT: '0', NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    port = await waitForServerStart(proc, 10000);
  });

  afterAll(async () => {
    if (proc && !proc.killed) {
      proc.kill();
    }
  });

  test('admin endpoints and parse behaviors (strict per request)', async () => {
    const fetch = (globalThis as any).fetch || require('node-fetch');
    const adminGetWan = await fetch(`http://localhost:${port}/admin/getWasmBacked`);
    expect(adminGetWan.status).toBe(200);
    const wasmJson: any = await adminGetWan.json();
    expect(typeof wasmJson.wasm).toBe('boolean');

    // Ensure fallback enabled initially
    const gf = await fetch(`http://localhost:${port}/admin/getParseFallback`);
    expect(gf.status).toBe(200);
    const fallbackJson: any = await gf.json();
    expect(typeof fallbackJson.fallback).toBe('boolean');

    // Ensure default parse returns empty record (fallback behavior) for invalid input
    const parseResp = await fetch(`http://localhost:${port}/parse`, { method: 'POST', body: JSON.stringify({ text: 'notlnmp' }), headers: { 'content-type': 'application/json' } });
    expect(parseResp.status).toBe(200);
    const parseJson: any = await parseResp.json();
    expect(parseJson.record).toBeDefined();

    // strict per request should return 500 structured error
    const strictResp = await fetch(`http://localhost:${port}/parse`, { method: 'POST', body: JSON.stringify({ text: 'notlnmp', strict: true }), headers: { 'content-type': 'application/json' } });
    expect(strictResp.status).toBe(500);
    const strictJson: any = await strictResp.json();
    expect(strictJson.code).toBeDefined();
    expect(strictJson.details).toBeDefined();

    // Use admin toggle to turn off fallback globally
    const setResp = await fetch(`http://localhost:${port}/admin/setParseFallback`, { method: 'POST', body: JSON.stringify({ fallback: false }), headers: { 'content-type': 'application/json' } });
    expect(setResp.status).toBe(200);

    // Non-strict parse now also returns 500
    const parseResp2 = await fetch(`http://localhost:${port}/parse`, { method: 'POST', body: JSON.stringify({ text: 'notlnmp' }), headers: { 'content-type': 'application/json' } });
    expect(parseResp2.status).toBe(500);

    // Check stats: fallbackCount should be >= 1 and wasmErrorCount should be >= 1
    const statsResp = await fetch(`http://localhost:${port}/admin/stats`);
    expect(statsResp.status).toBe(200);
    const stats: any = await statsResp.json();
    expect(typeof stats.fallbackCount).toBe('number');
    expect(typeof stats.wasmErrorCount).toBe('number');
    expect(stats.fallbackCount).toBeGreaterThanOrEqual(1);
    expect(stats.wasmErrorCount).toBeGreaterThanOrEqual(1);
  });
});
