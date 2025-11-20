#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  return r.status === 0;
}

console.log('Building TypeScript and optionally building wasm...');
const wasmPack = spawnSync('which wasm-pack', { shell: true });
if (wasmPack.status === 0) {
  console.log('Found wasm-pack; building WASM...');
  const ok = run('wasm-pack', ['build', '--target', 'nodejs', '--release']);
  if (ok) {
    // attempt copy, same as previously used in dev flow
    const srcDir = path.join(__dirname, '..', 'rust', 'pkg');
    const outDir = path.join(__dirname, '..', 'src', 'wasm');
    try {
      fs.readdirSync(srcDir).forEach(f => {
        const s = path.join(srcDir, f);
        const d = path.join(outDir, f);
        try { fs.copyFileSync(s, d); } catch (e) { /* ignore */ }
      });
      console.log('Copied wasm pkg files to src/wasm');
    } catch (e) {
      // noop
      console.warn('Failed to copy wasm pkg; continue');
    }
  } else {
    console.warn('wasm-pack build failed; continuing without wasm build');
  }
} else {
  console.log('wasm-pack not found; skipping wasm build (this is fine for JS-only dev)');
}

console.log('Building TypeScript...');
run('npm', ['run', 'build']);

console.log('Done.');
