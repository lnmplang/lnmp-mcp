/*
 * lnmp.ts - WASM Loader + JS fallback for LNMP tools
 * This module exposes: initWasm, parse, encode, encodeBinary, decodeBinary, schemaDescribe, debugExplain
 * For v0.1 we expect the Rust crate to provide wasm-bindgen-generated glue and functions; this wrapper will call them.
 */

import fs from "fs";
import path from "path";

// These function placeholders will be replaced when WASM is initialized.
let _parse: (text: string) => any = (t) => { throw new Error("WASM not initialized"); };
let _parseFallback = true; // when true, fall back to JS parser on wasm parse errors; when false, surface structured errors
// Fallback JS parser implementation we can always call on wasm errors
function fallbackParse(t: string) {
  const record: Record<string, any> = {};
  const lines = (t || "").split(/\s*\n\s*|\s+/).filter(Boolean);
  for (const l of lines) {
    const m = /^F(\d+)=([\s\S]*)$/.exec(l);
    if (m) {
      const k = m[1];
      let v: any = m[2];
      if (/^\d+$/.test(v)) v = Number(v);
      else if (v === "1" || v === "true") v = true;
      else if (v === "0" || v === "false") v = false;
      record[k] = v;
    }
  }
  return record;
}
let _encode: (obj: any) => string = (o) => { throw new Error("WASM not initialized"); };
let _encodeBinary: (text: string) => Uint8Array = (t) => { throw new Error("WASM not initialized"); };
let _decodeBinary: (buf: Uint8Array) => string = (b) => { throw new Error("WASM not initialized"); };
let _schemaDescribe: (mode: string) => any = (m) => { throw new Error("WASM not initialized"); };
let _debugExplain: (text: string) => string = (t) => { throw new Error("WASM not initialized"); };

// ready promise and the init function will be used for deterministic init
let _initPromise: Promise<void> | null = null;
let _wasmLoaded = false;
let _fallbackCount = 0;
let _wasmErrorCount = 0;

export const LNMP_WASM_ENV_VAR = "LNMP_WASM_PATH";

function normalizeWasmJsValue(v: any): any {
  if (v instanceof Map) {
    const obj: any = {};
    for (const [k, val] of (v as Map<any, any>).entries()) {
      obj[k] = normalizeWasmJsValue(val);
    }
    return obj;
  }
  if (Array.isArray(v)) return v.map(normalizeWasmJsValue);
  return v;
}

function recordToJson(rec: any): any {
  if (rec == null) return rec;
  if (rec instanceof Map) return Object.fromEntries(rec);
  if (Array.isArray(rec)) return rec;
  if (typeof rec === "object") return rec;
  return rec;
}

export async function initWasmFromFile(wasmPath: string) {
  const abs = path.resolve(wasmPath);
  const bytes = await fs.promises.readFile(abs);
  return initWasm(bytes.buffer);
}

export async function initWasm(bytes: ArrayBuffer | Buffer | Uint8Array) {
  const go = undefined;
  // If a JS glue file exists (wasm-pack), prefer requiring it. This will load the proper
  // wasm-bindgen glue and setup imports.
  let wasmExports: any = undefined;
  try {
    // Search for common locations for wasm-pack glue
    const searchPaths = [
      path.resolve(__dirname, "../wasm/lnmp_wasm.js"),
      path.resolve(__dirname, "../../wasm/lnmp_wasm.js"),
      path.resolve(__dirname, "./wasm/lnmp_wasm.js"),
      path.resolve(__dirname, "../lnmp_wasm.js"),
    ];
    for (const possibleJsPath of searchPaths) {
      if (fs.existsSync(possibleJsPath)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(possibleJsPath);
        // If wasm-bindgen glue export is found synchronously, prefer it
        if (mod && typeof mod.parse === "function") {
          wasmExports = mod;
          break;
        }
        // Otherwise, try calling an init function if provided
        if (mod && typeof mod.init === "function") {
          await mod.init(possibleJsPath.replace(/\.js$/, "_bg.wasm"));
          wasmExports = mod;
          break;
        }
        if (typeof mod === "function") {
          // Some glue modules are callable, try initialize with wasm bytes
          const maybe = await mod(bytes);
          if (maybe && typeof maybe.parse === "function") {
            wasmExports = maybe;
            break;
          }
        }
      }
    }
  } catch (err) {
    // noop; we'll fallback to other methods.
    console.warn("Failed to require wasm-pack JS glue; falling back to direct instantiation.", err);
  }

  if (!wasmExports) {
    // Fallback: attempt to instantiate the WebAssembly module directly.
    const mod = await WebAssembly.instantiate(bytes as any, {});
    wasmExports = (mod as any).instance.exports as any;
  }
  const exports = wasmExports;

  // Map our wrapper functions to the exported functions; they must be present in the wasm module
  // Export names are expected to be: parse, encode, encode_binary, decode_binary, schema_describe, debug_explain.
  if (exports.parse) {
    _parse = (t: string) => {
      try {
        const ret = (exports.parse as any)(t);
        // When wasm-bindgen glue returns a JS Map, convert to JSON
        return recordToJson(ret);
      } catch (rawErr) {
        const err = normalizeWasmJsValue(rawErr);
        console.log('WASM parse catch: _parseFallback=', _parseFallback, 'err type=', typeof err, 'hasCode=', (err && typeof err === 'object' && 'code' in (err as any)));
        // Convert WASM structured error to JS Error if possible
        const wasmErr = (err && typeof err === 'object' && 'code' in (err as any)) ? err as any : null;
        if (_parseFallback) {
          if (wasmErr) {
            const e = new Error(wasmErr.message || String(wasmErr));
            (e as any).code = wasmErr.code;
            (e as any).details = wasmErr.details;
            console.warn("WASM parse failed with structured error, using fallback JS parser:", e);
          } else {
            console.warn("WASM parse failed, using fallback JS parser:", err);
          }
          _fallbackCount++;
          return fallbackParse(t);
        }
        // If not falling back, rethrow structured error (or raw error)
        if (wasmErr) {
          const e = new Error(wasmErr.message || String(wasmErr));
          (e as any).code = wasmErr.code;
          (e as any).details = wasmErr.details;
          console.log('Throwing wasmErr as JS Error');
          _wasmErrorCount++;
          throw e;
        }
        console.log('Throwing raw error');
        throw err;
      }
    };
    _wasmLoaded = true;
  }

  // As a fallback, if exports are not present, expose minimal JS fallback.
  if (!exports.parse) {
    _parse = (t: string) => {
      // Extremely simplified LNMP parser fallback (very limited) — for dev only.
      const record: Record<string, any> = {};
      const lines = (t || "").split(/\s*\n\s*|\s+/).filter(Boolean);
      for (const l of lines) {
        const m = /^F(\d+)=([\s\S]*)$/.exec(l);
        if (m) {
          const k = m[1];
          let v: any = m[2];
          if (/^\d+$/.test(v)) v = Number(v);
          else if (v === "1" || v === "true") v = true;
          else if (v === "0" || v === "false") v = false;
          record[k] = v;
        }
      }
      return record;
    };
    _wasmLoaded = false;
  }

  // Minimal other wrappers for dev
  _encode = (obj) => {
    try {
      return exports.encode ? (exports.encode as any)(obj) : Object.entries(obj).map(([k, v]) => `F${k}=${v}`).join("\n");
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in (err as any)) {
        const wasmErr = err as any;
        const e = new Error(wasmErr.message || String(wasmErr));
        (e as any).code = wasmErr.code;
        (e as any).details = wasmErr.details;
        throw e;
      }
      throw err;
    }
  };

  _encodeBinary = (text) => {
    try {
      return exports.encode_binary ? (exports.encode_binary as any)(text) : Buffer.from(text, "utf8");
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in (err as any)) {
        const wasmErr = err as any;
        const e = new Error(wasmErr.message || String(wasmErr));
        (e as any).code = wasmErr.code;
        (e as any).details = wasmErr.details;
        throw e;
      }
      throw err;
    }
  };

  _decodeBinary = (buf) => {
    try {
      return exports.decode_binary ? (exports.decode_binary as any)(buf) : Buffer.from(buf).toString("utf8");
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in (err as any)) {
        const wasmErr = err as any;
        const e = new Error(wasmErr.message || String(wasmErr));
        (e as any).code = wasmErr.code;
        (e as any).details = wasmErr.details;
        throw e;
      }
      throw err;
    }
  };

  _schemaDescribe = (mode) => {
    try {
      return exports.schema_describe ? (exports.schema_describe as any)(mode) : { fields: { "7": "boolean", "12": "int" } };
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in (err as any)) {
        const wasmErr = err as any;
        const e = new Error(wasmErr.message || String(wasmErr));
        (e as any).code = wasmErr.code;
        (e as any).details = wasmErr.details;
        throw e;
      }
      throw err;
    }
  };

  _debugExplain = (text) => {
    try {
      return exports.debug_explain ? (exports.debug_explain as any)(text) : (() => {
        const rec = _parse(text);
        const entries = Object.entries(rec).map(([k, v]) => `F${k}=${v}    # ${k}`).join("\n");
        return entries;
      })();
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in (err as any)) {
        const wasmErr = err as any;
        const e = new Error(wasmErr.message || String(wasmErr));
        (e as any).code = wasmErr.code;
        (e as any).details = wasmErr.details;
        throw e;
      }
      throw err;
    }
  };
}

/**
 * Deterministic, safe init entrypoint for the LNMP wasm module.
 * Options:
 *  - path: explicit path to wasm file
 *  - bytes: directly provide a wasm bytes buffer
 * The function uses environment variable override LNMP_WASM_PATH and falls
 * back to reasonable defaults. Also detects node/browser environment.
 */
export async function initLnmpWasm(options?: { path?: string; bytes?: ArrayBuffer | Buffer | Uint8Array; force?: boolean; }) {
  if (_initPromise && !options?.force) return _initPromise;
  _initPromise = (async () => {
    // Determine a path: options.path > env var > local wasm built path
    const wasmPath = options?.path || process.env[LNMP_WASM_ENV_VAR] || path.resolve(__dirname, "../wasm/lnmp_wasm_bg.wasm");
    if (options?.bytes) {
      await initWasm(options.bytes as any);
      return;
    }
    // Only attempt to read file in node (fs exists)
    if (typeof window === 'undefined') {
      try {
        const stat = await fs.promises.stat(wasmPath).catch(() => null);
        if (stat) {
          await initWasmFromFile(wasmPath);
          return;
        }
      } catch (err) {
        // continue fallback
      }
    }
    // If no file available, attempt to initialize using the wasm bytes in package dir
    // or fall back to JS only implementation (already provided)
    return;
  })();
  return _initPromise;
}

export const lnmp = {
  ready: async () => { await initLnmpWasm(); },
  parse: (text: string) => {
    const rec = recordToJson(_parse(text));
    // If wasm returned an empty record but fallback is enabled, count it as a fallback use.
    if ((rec && typeof rec === 'object' && Object.keys(rec).length === 0) && _parseFallback) {
      _fallbackCount++;
    }
    // If strict mode is enabled (no fallback) and parsing returned an empty
    // record for non-empty text input, treat this as a parse error and throw.
    if (!_parseFallback && text && text.trim().length > 0) {
      const maybeObj = rec as any;
      if (maybeObj && typeof maybeObj === 'object' && Object.keys(maybeObj).length === 0) {
        const e = new Error('Strict parse failed: no fields parsed');
        (e as any).code = 'UNEXPECTED_TOKEN';
        (e as any).details = { reason: 'no_fields_parsed', text };
        _wasmErrorCount++;
        throw e;
      }
    }
    return rec;
  },
  encode: (obj: any) => {
    try {
      return _encode(obj);
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in err) {
        const e = new Error(err.message || String(err));
        (e as any).code = err.code;
        (e as any).details = err.details;
        throw e;
      }
      throw err;
    }
  },
  encodeBinary: (text: string) => {
    try {
      return _encodeBinary(text);
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in err) {
        const e = new Error(err.message || String(err));
        (e as any).code = err.code;
        (e as any).details = err.details;
        throw e;
      }
      throw err;
    }
  },
  decodeBinary: (binary: string | Uint8Array) => {
    if (typeof binary === 'string') {
      // basic base64 validation
      const candidate = binary.trim();
      if (!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(candidate)) {
        throw new Error('decodeBinary: invalid base64');
      }
      const buf = Buffer.from(candidate, 'base64');
      return _decodeBinary(buf as any);
    }
    try {
      return _decodeBinary(binary as any);
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in err) {
        const e = new Error(err.message || String(err));
        (e as any).code = err.code;
        (e as any).details = err.details;
        throw e;
      }
      throw err;
    }
  },
  schemaDescribe: (mode?: string) => {
    try {
      const s = _schemaDescribe(mode || 'full');
      const val = normalizeWasmJsValue(s);
      if (val && typeof val === 'object' && val.fields) {
        return val;
      }
      if (val && typeof val === 'object' && !('fields' in val)) {
        const keys = Object.keys(val);
        if (keys.length && keys.every(k => /^\d+$/.test(k))) {
          return { fields: val };
        }
      }
      return val;
      if (s && typeof s === 'object' && !('fields' in s)) {
        const keys = Object.keys(s);
        if (keys.length && keys.every(k => /^\d+$/.test(k))) {
          return { fields: s };
        }
      }
      return s;
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in err) {
        const e = new Error(err.message || String(err));
        (e as any).code = err.code;
        (e as any).details = err.details;
        throw e;
      }
      throw err;
    }
  },
  debugExplain: (text: string) => {
    try {
      return _debugExplain(text);
    } catch (rawErr) {
      const err = normalizeWasmJsValue(rawErr);
      if (err && typeof err === 'object' && 'code' in err) {
        const e = new Error(err.message || String(err));
        (e as any).code = err.code;
        (e as any).details = err.details;
        throw e;
      }
      throw err;
    }
  },
  initLnmpWasm,
  setParseFallback: (v: boolean) => { _parseFallback = !!v; },
  getParseFallback: () => _parseFallback,
  // Diagnostic: return whether the current parse implementation is backed by WASM
  isWasmBacked: () => _wasmLoaded,
  getStats: () => ({ fallbackCount: _fallbackCount, wasmErrorCount: _wasmErrorCount }),
};

function normalizeForEncode(obj: any) {
  if (obj instanceof Map) obj = Object.fromEntries(obj);
  if (typeof obj !== 'object' || obj == null) return obj;
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else out[k] = v;
  }
  return out;
}

// Override encode to normalize booleans to integers (1/0) for canonical LNMP
lnmp.encode = (obj: any) => {
  const normalized = normalizeForEncode(obj);
  return _encode(normalized);
};

export function parse(text: string) {
  try {
    const rec = _parse(text);
    if ((rec && typeof rec === 'object' && Object.keys(rec).length === 0) && _parseFallback) {
      _fallbackCount++;
    }
    if (!_parseFallback && text && text.trim().length > 0) {
      const maybeObj = rec as any;
      if (maybeObj && typeof maybeObj === 'object' && Object.keys(maybeObj).length === 0) {
        const e = new Error('Strict parse failed: no fields parsed');
        (e as any).code = 'UNEXPECTED_TOKEN';
        (e as any).details = { reason: 'no_fields_parsed', text };
        throw e;
      }
    }
    return rec;
  } catch (rawErr) {
    const err = normalizeWasmJsValue(rawErr);
    if (err && typeof err === 'object' && 'code' in err) {
      const e = new Error(err.message || String(err));
      (e as any).code = err.code;
      (e as any).details = err.details;
      throw e;
    }
    throw err;
  }
}

export function encode(obj: any) {
  try {
    return _encode(obj);
  } catch (rawErr) {
    const err = normalizeWasmJsValue(rawErr);
    if (err && typeof err === 'object' && 'code' in err) {
      const e = new Error(err.message || String(err));
      (e as any).code = err.code;
      (e as any).details = err.details;
      throw e;
    }
    throw err;
  }
}

export function encodeBinary(text: string) {
  try {
    const u = _encodeBinary(text);
    return u instanceof Uint8Array ? u : Buffer.from(u as any);
  } catch (rawErr) {
    const err = normalizeWasmJsValue(rawErr);
    if (err && typeof err === 'object' && 'code' in err) {
      const e = new Error(err.message || String(err));
      (e as any).code = err.code;
      (e as any).details = err.details;
      throw e;
    }
    throw err;
  }
}

export function decodeBinary(binary: string | Uint8Array) {
  try {
    const buf = typeof binary === "string" ? Buffer.from(binary, "base64") : binary;
    return _decodeBinary(buf as any);
  } catch (rawErr) {
    const err = normalizeWasmJsValue(rawErr);
    if (err && typeof err === 'object' && 'code' in err) {
      const e = new Error(err.message || String(err));
      (e as any).code = err.code;
      (e as any).details = err.details;
      throw e;
    }
    throw err;
  }
}

export function schemaDescribe(mode = "full") {
  try {
    const s = _schemaDescribe(mode);
    const val = normalizeWasmJsValue(s);
    if (val && typeof val === 'object' && val.fields) return val;
    if (val && typeof val === 'object' && !('fields' in val)) {
      const keys = Object.keys(val as any);
      if (keys.length && keys.every(k => /^\d+$/.test(k))) {
        return { fields: val };
      }
    }
    return val;
  } catch (rawErr) {
    const err = normalizeWasmJsValue(rawErr);
    if (err && typeof err === 'object' && 'code' in err) {
      const e = new Error(err.message || String(err));
      (e as any).code = err.code;
      (e as any).details = err.details;
      throw e;
    }
    throw err;
  }
}

export function debugExplain(text: string) {
  try {
    return _debugExplain(text);
  } catch (rawErr) {
    const err = normalizeWasmJsValue(rawErr);
    if (err && typeof err === 'object' && 'code' in err) {
      const e = new Error(err.message || String(err));
      (e as any).code = err.code;
      (e as any).details = err.details;
      throw e;
    }
    throw err;
  }
}
