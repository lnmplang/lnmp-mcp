/*
 * lnmp.ts - WASM Loader + JS fallback for LNMP tools
 * This module exposes: initWasm, parse, encode, encodeBinary, decodeBinary, schemaDescribe, debugExplain
 * For v0.1 we expect the Rust crate to provide wasm-bindgen-generated glue and functions; this wrapper will call them.
 */

import fs from "fs";
import path from "path";

export type SanitizeLevel = "minimal" | "normal" | "aggressive";
export type SanitizeOptions = {
  level?: SanitizeLevel;
  autoQuoteStrings?: boolean;
  autoEscapeQuotes?: boolean;
  normalizeBooleans?: boolean;
  normalizeNumbers?: boolean;
};

export type SanitizeResult = { text: string; changed: boolean; config?: Record<string, any> };
export type ParseOptions = { mode?: "strict" | "lenient"; allowFallback?: boolean };
export type EncodeBinaryOptions = { mode?: "strict" | "lenient"; sanitize?: boolean | SanitizeOptions };

// These function placeholders will be replaced when WASM is initialized.
let _parse: (text: string) => any = (t) => { throw new Error("WASM not initialized"); };
let _parseLenient: (text: string) => any = (t) => { throw new Error("WASM not initialized"); };
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
let _encodeBinaryLenient: (text: string) => Uint8Array = (t) => { throw new Error("WASM not initialized"); };
let _decodeBinary: (buf: Uint8Array) => string = (b) => { throw new Error("WASM not initialized"); };
let _schemaDescribe: (mode: string) => any = (m) => { throw new Error("WASM not initialized"); };
let _debugExplain: (text: string) => string = (t) => { throw new Error("WASM not initialized"); };
let _sanitize: (text: string, options?: SanitizeOptions | boolean) => SanitizeResult = (t) => { throw new Error("WASM not initialized"); };

// New WASM exports from meta crate (13 functions)
let _envelopeWrap: (record: any, metadata: any) => any = () => { throw new Error("WASM not initialized"); };
let _envelopeToBinaryTlv: (metadata: any) => Uint8Array = () => { throw new Error("WASM not initialized"); };
let _envelopeFromBinaryTlv: (bytes: Uint8Array) => any = () => { throw new Error("WASM not initialized"); };
let _routingDecide: (message: any, nowMs: number) => string = () => { throw new Error("WASM not initialized"); };
let _routingImportanceScore: (message: any, nowMs: number) => number = () => { throw new Error("WASM not initialized"); };
let _transportToHttpHeaders: (envelope: any) => any = () => { throw new Error("WASM not initialized"); };
let _transportFromHttpHeaders: (headers: any) => any = () => { throw new Error("WASM not initialized"); };
let _embeddingComputeDelta: (base: number[], updated: number[]) => any = () => { throw new Error("WASM not initialized"); };
let _embeddingApplyDelta: (base: number[], delta: any) => number[] = () => { throw new Error("WASM not initialized"); };
let _spatialEncodeSnapshot: (positions: number[]) => Uint8Array = () => { throw new Error("WASM not initialized"); };
let _spatialEncodeDelta: (prev: number[], curr: number[]) => Uint8Array = () => { throw new Error("WASM not initialized"); };
let _contextScoreEnvelope: (envelope: any, nowMs: number) => any = () => { throw new Error("WASM not initialized"); };

// ready promise and the init function will be used for deterministic init
let _initPromise: Promise<void> | null = null;
let _wasmLoaded = false;
let _fallbackCount = 0;
let _wasmErrorCount = 0;

export const LNMP_WASM_ENV_VAR = "LNMP_WASM_PATH";

function fallbackSanitize(text: string, options?: SanitizeOptions | boolean): SanitizeResult {
  const lines = (text || "").split(/\r?\n/);
  const opts = normalizeSanitizeOptions(options);
  let changed = false;
  const sanitizedLines = lines.map((rawLine) => {
    const line = rawLine.trim();
    if (!line) return line;
    const m = /^F(\d+)=(.*)$/.exec(line);
    if (!m) return line;
    const fid = m[1];
    let value = m[2];
    const quoted = /^\"[\s\S]*\"$/.test(value);
    if (!quoted && /["\s]/.test(value)) {
      const escaped = value.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
      value = `"${escaped}"`;
      changed = true;
    }
    if (!quoted && opts.normalizeBooleans) {
      if (/^(true|yes)$/i.test(value)) { value = "1"; changed = true; }
      else if (/^(false|no)$/i.test(value)) { value = "0"; changed = true; }
    }
    if (!quoted && opts.normalizeNumbers && /^-?\d+(\.\d+)?$/.test(value)) {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        value = String(num);
        changed = true;
      }
    }
    return `F${fid}=${value}`;
  });
  const sanitizedText = sanitizedLines.filter((l) => l !== "").join("\n");
  return { text: sanitizedText, changed, config: { ...opts } };
}

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

function normalizeSanitizeOptions(options?: SanitizeOptions | boolean): SanitizeOptions {
  if (options === undefined) return {};
  if (typeof options === "boolean") return options ? {} : {};
  return options || {};
}

function normalizeSanitizeResult(res: any): SanitizeResult {
  const val = normalizeWasmJsValue(res);
  if (val && typeof val === "object" && "text" in (val as any)) {
    return {
      text: (val as any).text,
      changed: !!(val as any).changed,
      config: (val as any).config,
    };
  }
  return { text: String(res ?? ""), changed: false };
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

  if (exports.parse_lenient) {
    _parseLenient = (t: string) => {
      try {
        const ret = (exports.parse_lenient as any)(t);
        return recordToJson(ret);
      } catch (rawErr) {
        const err = normalizeWasmJsValue(rawErr);
        if (_parseFallback) {
          const sanitized = fallbackSanitize(t);
          _fallbackCount++;
          try {
            return _parse(sanitized.text);
          } catch {
            return fallbackParse(sanitized.text);
          }
        }
        throw err;
      }
    };
  } else {
    _parseLenient = (t: string) => {
      const sanitized = fallbackSanitize(t);
      try {
        return _parse(sanitized.text);
      } catch (err) {
        if (_parseFallback) return fallbackParse(sanitized.text);
        throw err;
      }
    };
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

  _encodeBinaryLenient = (text) => {
    try {
      return exports.encode_binary_lenient
        ? (exports.encode_binary_lenient as any)(text)
        : _encodeBinary(fallbackSanitize(text, { autoQuoteStrings: true }).text);
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

  _sanitize = (text, options) => {
    const normalized = normalizeSanitizeOptions(options);
    if (exports.sanitize) {
      try {
        const res = (exports.sanitize as any)(text, normalized);
        return normalizeSanitizeResult(res);
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
    }
    return fallbackSanitize(text, normalized);
  };

  // Wire up new WASM exports from meta crate (13 functions)
  if (exports.envelope_wrap) {
    _envelopeWrap = (record, metadata) => {
      try {
        const res = (exports.envelope_wrap as any)(record, metadata);
        return normalizeWasmJsValue(res);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.envelope_to_binary_tlv) {
    _envelopeToBinaryTlv = (metadata) => {
      try {
        return (exports.envelope_to_binary_tlv as any)(metadata);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.envelope_from_binary_tlv) {
    _envelopeFromBinaryTlv = (bytes) => {
      try {
        const res = (exports.envelope_from_binary_tlv as any)(bytes);
        return normalizeWasmJsValue(res);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.routing_decide) {
    _routingDecide = (message, nowMs) => {
      try {
        return (exports.routing_decide as any)(message, nowMs);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.routing_importance_score) {
    _routingImportanceScore = (message, nowMs) => {
      try {
        return (exports.routing_importance_score as any)(message, nowMs);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.transport_to_http_headers) {
    _transportToHttpHeaders = (envelope) => {
      try {
        const res = (exports.transport_to_http_headers as any)(envelope);
        return normalizeWasmJsValue(res);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.transport_from_http_headers) {
    _transportFromHttpHeaders = (headers) => {
      try {
        const res = (exports.transport_from_http_headers as any)(headers);
        return normalizeWasmJsValue(res);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.embedding_compute_delta) {
    _embeddingComputeDelta = (base, updated) => {
      try {
        const res = (exports.embedding_compute_delta as any)(base, updated);
        return normalizeWasmJsValue(res);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.embedding_apply_delta) {
    _embeddingApplyDelta = (base, delta) => {
      try {
        return (exports.embedding_apply_delta as any)(base, delta);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.spatial_encode_snapshot) {
    _spatialEncodeSnapshot = (positions) => {
      try {
        return (exports.spatial_encode_snapshot as any)(positions);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.spatial_encode_delta) {
    _spatialEncodeDelta = (prev, curr) => {
      try {
        return (exports.spatial_encode_delta as any)(prev, curr);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }

  if (exports.context_score_envelope) {
    _contextScoreEnvelope = (envelope, nowMs) => {
      try {
        const res = (exports.context_score_envelope as any)(envelope, nowMs);
        return normalizeWasmJsValue(res);
      } catch (err) {
        throw normalizeWasmJsValue(err);
      }
    };
  }
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

function parseWithOptions(text: string, options?: ParseOptions) {
  const mode = options?.mode || "lenient";
  const allowFallback = options?.allowFallback !== false;
  const prevFallback = _parseFallback;
  if (!allowFallback) _parseFallback = false;
  try {
    const rec = recordToJson(mode === "lenient" ? _parseLenient(text) : _parse(text));
    const recObj = rec as any;
    if (allowFallback && recObj && typeof recObj === 'object' && Object.keys(recObj).length === 0) {
      _fallbackCount++;
    }
    if (!allowFallback && text && text.trim().length > 0) {
      if (recObj && typeof recObj === 'object' && Object.keys(recObj).length === 0) {
        const e = new Error('Strict parse failed: no fields parsed');
        (e as any).code = 'UNEXPECTED_TOKEN';
        (e as any).details = { reason: 'no_fields_parsed', text };
        _wasmErrorCount++;
        throw e;
      }
    }
    return rec;
  } catch (rawErr) {
    const err = normalizeWasmJsValue(rawErr);
    if (err && typeof err === 'object' && 'code' in err) {
      const e = new Error(err.message || String(err));
      (e as any).code = (err as any).code;
      (e as any).details = (err as any).details;
      throw e;
    }
    throw err;
  } finally {
    _parseFallback = prevFallback;
  }
}

function encodeBinaryWithOptions(text: string, options?: EncodeBinaryOptions) {
  const mode = options?.mode || "lenient";
  const shouldSanitize = options?.sanitize !== false && (options?.sanitize !== undefined || mode === "lenient");
  const sanitizeOpts = shouldSanitize ? normalizeSanitizeOptions(options?.sanitize === true ? {} : options?.sanitize) : undefined;
  const prepared = shouldSanitize ? _sanitize(text, sanitizeOpts).text : text;
  if (mode === "lenient") return _encodeBinaryLenient(prepared);
  return _encodeBinary(prepared);
}

export const lnmp = {
  ready: async () => { await initLnmpWasm(); },
  parse: (text: string, options?: ParseOptions) => parseWithOptions(text, options),
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
  encodeBinary: (text: string, options?: EncodeBinaryOptions) => {
    try {
      return encodeBinaryWithOptions(text, options);
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
  sanitize: (text: string, options?: SanitizeOptions | boolean) => _sanitize(text, options),
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

  // New exports from meta crate (13 functions)
  envelopeWrap: (record: any, metadata: any) => _envelopeWrap(record, metadata),
  envelopeToBinaryTlv: (metadata: any) => _envelopeToBinaryTlv(metadata),
  envelopeFromBinaryTlv: (bytes: Uint8Array) => _envelopeFromBinaryTlv(bytes),
  routingDecide: (message: any, nowMs: number) => _routingDecide(message, nowMs),
  routingImportanceScore: (message: any, nowMs: number) => _routingImportanceScore(message, nowMs),
  transportToHttpHeaders: (envelope: any) => _transportToHttpHeaders(envelope),
  transportFromHttpHeaders: (headers: any) => _transportFromHttpHeaders(headers),
  embeddingComputeDelta: (base: number[], updated: number[]) => _embeddingComputeDelta(base, updated),
  embeddingApplyDelta: (base: number[], delta: any) => _embeddingApplyDelta(base, delta),
  spatialEncodeSnapshot: (positions: number[]) => _spatialEncodeSnapshot(positions),
  spatialEncodeDelta: (prev: number[], curr: number[]) => _spatialEncodeDelta(prev, curr),
  contextScoreEnvelope: (envelope: any, nowMs: number) => _contextScoreEnvelope(envelope, nowMs),
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

export function parse(text: string, options?: ParseOptions) {
  return parseWithOptions(text, options);
}

export function encode(obj: any) {
  return lnmp.encode(obj);
}

export function encodeBinary(text: string, options?: EncodeBinaryOptions) {
  const u = encodeBinaryWithOptions(text, options);
  return u instanceof Uint8Array ? u : Buffer.from(u as any);
}

export function decodeBinary(binary: string | Uint8Array) {
  if (typeof binary === "string") {
    const buf = Buffer.from(binary, "base64");
    return _decodeBinary(buf as any);
  }
  return _decodeBinary(binary as any);
}

export function schemaDescribe(mode = "full") {
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
}

export function debugExplain(text: string) {
  return _debugExplain(text);
}

export function sanitize(text: string, options?: SanitizeOptions | boolean) {
  return _sanitize(text, options);
}
