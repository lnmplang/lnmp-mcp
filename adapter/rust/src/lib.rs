use wasm_bindgen::prelude::*;
use serde_wasm_bindgen::{to_value, from_value};
use serde_json::{Value as JsonValue, Number as JsonNumber, json};
use serde::Deserialize;

// Updated to use unified lnmp meta crate
use lnmp::core::{LnmpRecord, LnmpField, LnmpValue};
use lnmp::codec::{Parser, Encoder};
use lnmp::codec::binary::{BinaryEncoder, BinaryDecoder};
use lnmp::codec::binary::encoder::EncoderConfig as BinaryEncoderConfig;
use lnmp::codec::config::TextInputMode;
use lnmp::sanitize::{sanitize_lnmp_text, SanitizationConfig, SanitizationLevel};

// New module imports from meta crate
use lnmp::envelope::{EnvelopeBuilder, EnvelopeMetadata, LnmpEnvelope};
use lnmp::envelope::binary_codec::{TlvEncoder, TlvDecoder};
use lnmp::net::{MessageKind, NetMessage, RoutingPolicy, RoutingDecision};
use lnmp::transport::{http, kafka, grpc, nats};
use lnmp::embedding::{VectorDelta, Vector};
use lnmp::spatial::protocol::{SpatialFrame, SpatialStreamer};
use lnmp::sfe::{ContextScorer, ContextScorerConfig};

use serde_yaml;
// Include the example semantic dictionary at compile time to return authoritative schema info
const EXAMPLE_SEMANTIC_DICTIONARY_YAML: &str = include_str!("../../../../../examples/examples/semantic_dictionary.yaml");

/// Convert LnmpRecord into serde_json::Value object for wasm
fn record_to_json(record: &LnmpRecord) -> JsonValue {
    let mut map = serde_json::Map::new();
    for field in record.sorted_fields() {
        let key = field.fid.to_string();
        let val = match &field.value {
            LnmpValue::Int(i) => JsonValue::Number(JsonNumber::from(*i)),
            LnmpValue::Float(fv) => JsonValue::Number(JsonNumber::from_f64(*fv).unwrap_or(JsonNumber::from(0))),
            LnmpValue::Bool(b) => JsonValue::Bool(*b),
            LnmpValue::String(s) => JsonValue::String(s.clone()),
            LnmpValue::StringArray(arr) => JsonValue::Array(arr.iter().map(|s| JsonValue::String(s.clone())).collect()),
            LnmpValue::NestedRecord(nr) => record_to_json(nr),
            LnmpValue::NestedArray(arr) => JsonValue::Array(arr.iter().map(|r| record_to_json(r)).collect()),
            // New v0.6 types
            LnmpValue::IntArray(arr) => JsonValue::Array(arr.iter().map(|i| JsonValue::Number(JsonNumber::from(*i))).collect()),
            LnmpValue::FloatArray(arr) => JsonValue::Array(arr.iter().map(|f| JsonValue::Number(JsonNumber::from_f64(*f).unwrap_or(JsonNumber::from(0)))).collect()),
            LnmpValue::BoolArray(arr) => JsonValue::Array(arr.iter().map(|b| JsonValue::Bool(*b)).collect()),
            LnmpValue::Embedding(_) | LnmpValue::EmbeddingDelta(_) | LnmpValue::QuantizedEmbedding(_) => {
                // For now, serialize complex types as empty objects
                JsonValue::Object(serde_json::Map::new())
            }
        };
        map.insert(key, val);
    }
    JsonValue::Object(map)
}

fn js_error(code: &str, message: &str, details: Option<JsonValue>) -> JsValue {
    let mut map = serde_json::Map::new();
    map.insert("code".to_string(), JsonValue::String(code.to_string()));
    map.insert("message".to_string(), JsonValue::String(message.to_string()));
    if let Some(d) = details {
        map.insert("details".to_string(), d);
    }
    to_value(&JsonValue::Object(map)).unwrap_or_else(|_| JsValue::from_str(message))
}

fn map_lnmp_err(err: &lnmp::codec::error::LnmpError) -> (String, Option<JsonValue>) {
    use lnmp::codec::error::LnmpError::*;
    match err {
        InvalidCharacter { char, line, column } => (
            "INVALID_CHARACTER".to_string(),
            Some(json!({"char": char.to_string(), "line": line, "column": column})),
        ),
        UnterminatedString { line, column } => (
            "UNTERMINATED_STRING".to_string(),
            Some(json!({"line": line, "column": column})),
        ),
        UnexpectedToken { expected, found, line, column } => (
            "UNEXPECTED_TOKEN".to_string(),
            Some(json!({"expected": expected, "found": format!("{:?}", found), "line": line, "column": column})),
        ),
        InvalidFieldId { value, line, column } => (
            "INVALID_FIELD_ID".to_string(),
            Some(json!({"value": value, "line": line, "column": column})),
        ),
        InvalidValue { field_id, reason, line, column } => (
            "INVALID_VALUE".to_string(),
            Some(json!({"field_id": field_id, "reason": reason, "line": line, "column": column})),
        ),
        InvalidChecksum { field_id, reason, line, column } => (
            "INVALID_CHECKSUM".to_string(),
            Some(json!({"field_id": field_id, "reason": reason, "line": line, "column": column})),
        ),
        UnexpectedEof { line, column } => (
            "UNEXPECTED_EOF".to_string(),
            Some(json!({"line": line, "column": column})),
        ),
        InvalidEscapeSequence { sequence, line, column } => (
            "INVALID_ESCAPE_SEQUENCE".to_string(),
            Some(json!({"sequence": sequence, "line": line, "column": column})),
        ),
        StrictModeViolation { reason, line, column } => (
            "STRICT_MODE_VIOLATION".to_string(),
            Some(json!({"reason": reason, "line": line, "column": column})),
        ),
        TypeHintMismatch { field_id, expected_type, actual_value, line, column } => (
            "TYPE_HINT_MISMATCH".to_string(),
            Some(json!({"field_id": field_id, "expected": expected_type, "actual": actual_value, "line": line, "column": column})),
        ),
        InvalidTypeHint { hint, line, column } => (
            "INVALID_TYPE_HINT".to_string(),
            Some(json!({"hint": hint, "line": line, "column": column})),
        ),
        ChecksumMismatch { field_id, expected, found, line, column } => (
            "CHECKSUM_MISMATCH".to_string(),
            Some(json!({"field_id": field_id, "expected": expected, "found": found, "line": line, "column": column})),
        ),
        NestingTooDeep { max_depth, actual_depth, line, column } => (
            "NESTING_TOO_DEEP".to_string(),
            Some(json!({"max_depth": max_depth, "actual_depth": actual_depth, "line": line, "column": column})),
        ),
        InvalidNestedStructure { reason, line, column } => (
            "INVALID_NESTED_STRUCTURE".to_string(),
            Some(json!({"reason": reason, "line": line, "column": column})),
        ),
        DuplicateFieldId { field_id, line, column } => (
            "DUPLICATE_FIELD_ID".to_string(),
            Some(json!({"field_id": field_id, "line": line, "column": column})),
        ),
        UnclosedNestedStructure { structure_type, opened_at_line, opened_at_column, line, column } => (
            "UNCLOSED_NESTED_STRUCTURE".to_string(),
            Some(json!({"structure_type": structure_type, "opened_at_line": opened_at_line, "opened_at_column": opened_at_column, "line": line, "column": column})),
        ),
        ValidationError(reason) => (
            "VALIDATION_ERROR".to_string(),
            Some(json!({"reason": reason})),
        ),
    }
}

fn map_binary_err(err: &lnmp::codec::binary::error::BinaryError) -> (String, Option<JsonValue>) {
    use lnmp::codec::binary::error::BinaryError::*;
    match err {
        UnsupportedVersion { found, supported } => (
            "UNSUPPORTED_VERSION".to_string(),
            Some(json!({"found": found, "supported": supported})),
        ),
        InvalidFID { fid, reason } => (
            "INVALID_FID".to_string(),
            Some(json!({"fid": fid, "reason": reason})),
        ),
        InvalidTypeTag { tag } => (
            "INVALID_TYPE_TAG".to_string(),
            Some(json!({"tag": tag})),
        ),
        InvalidValue { field_id, type_tag, reason } => (
            "INVALID_BINARY_VALUE".to_string(),
            Some(json!({"field_id": field_id, "type_tag": type_tag, "reason": reason})),
        ),
        TrailingData { bytes_remaining } => (
            "TRAILING_DATA".to_string(),
            Some(json!({"bytes_remaining": bytes_remaining})),
        ),
        CanonicalViolation { reason } => (
            "CANONICAL_VIOLATION".to_string(),
            Some(json!({"reason": reason})),
        ),
        UnexpectedEof { expected, found } => (
            "UNEXPECTED_EOF".to_string(),
            Some(json!({"expected": expected, "found": found})),
        ),
        InvalidVarInt { reason } => (
            "INVALID_VARINT".to_string(),
            Some(json!({"reason": reason})),
        ),
        InvalidUtf8 { field_id } => (
            "INVALID_UTF8".to_string(),
            Some(json!({"field_id": field_id})),
        ),
        TextFormatError { source } => {
            let (code, details) = map_lnmp_err(source);
            ("TEXT_FORMAT_ERROR".to_string(), Some(json!({"text_format_error": {"code": code, "details": details}})))
        },
        NestingDepthExceeded { depth, max } => (
            "NESTING_DEPTH_EXCEEDED".to_string(),
            Some(json!({"depth": depth, "max": max})),
        ),
        NestedStructureNotSupported => (
            "NESTED_NOT_SUPPORTED".to_string(),
            None,
        ),
        RecordSizeExceeded { size, max } => (
            "RECORD_SIZE_EXCEEDED".to_string(),
            Some(json!({"size": size, "max": max})),
        ),
        InvalidNestedStructure { reason } => (
            "INVALID_NESTED_STRUCTURE".to_string(),
            Some(json!({"reason": reason})),
        ),
        DeltaError { reason } => (
            "DELTA_ERROR".to_string(),
            Some(json!({"reason": reason})),
        ),
        UnsupportedFeature { feature } => (
            "UNSUPPORTED_FEATURE".to_string(),
            Some(json!({ "feature": feature })),
        ),
    }
}

#[derive(Debug, Deserialize)]
struct WasmSanitizeOptions {
    level: Option<String>,
    auto_quote_strings: Option<bool>,
    auto_escape_quotes: Option<bool>,
    normalize_booleans: Option<bool>,
    normalize_numbers: Option<bool>,
}

fn sanitize_config_from_js(options: Option<JsValue>) -> Result<SanitizationConfig, JsValue> {
    let mut config = SanitizationConfig::default();
    if let Some(js_options) = options {
        if !js_options.is_null() && !js_options.is_undefined() {
            let opts: WasmSanitizeOptions = from_value(js_options)
                .map_err(|e| js_error("INVALID_SANITIZE_OPTIONS", &format!("Invalid sanitize options: {}", e), None))?;
            if let Some(level_str) = opts.level {
                config.level = match level_str.to_lowercase().as_str() {
                    "minimal" => SanitizationLevel::Minimal,
                    "normal" => SanitizationLevel::Normal,
                    "aggressive" => SanitizationLevel::Aggressive,
                    other => return Err(js_error("INVALID_SANITIZE_LEVEL", &format!("Unknown level: {}", other), None)),
                };
            }
            if let Some(v) = opts.auto_quote_strings { config.auto_quote_strings = v; }
            if let Some(v) = opts.auto_escape_quotes { config.auto_escape_quotes = v; }
            if let Some(v) = opts.normalize_booleans { config.normalize_booleans = v; }
            if let Some(v) = opts.normalize_numbers { config.normalize_numbers = v; }
        }
    }
    Ok(config)
}

fn config_to_json(config: &SanitizationConfig) -> JsonValue {
    json!({
        "level": match config.level {
            SanitizationLevel::Minimal => "minimal",
            SanitizationLevel::Normal => "normal",
            SanitizationLevel::Aggressive => "aggressive",
        },
        "autoQuoteStrings": config.auto_quote_strings,
        "autoEscapeQuotes": config.auto_escape_quotes,
        "normalizeBooleans": config.normalize_booleans,
        "normalizeNumbers": config.normalize_numbers,
    })
}

/// Convert a JSON object into LnmpRecord
fn json_to_record(js: &JsonValue) -> Result<LnmpRecord, String> {
    let mut rec = LnmpRecord::new();
    let obj = match js.as_object() { Some(o) => o, None => return Err("Value must be an object mapping FID -> value".to_string()) };
    for (k, v) in obj.iter() {
        let fid: u16 = k.parse().map_err(|_| format!("Invalid FID: {}", k))?;
        let lnmp_value = match v {
            JsonValue::Number(n) => {
                if n.is_i64() { LnmpValue::Int(n.as_i64().unwrap() as i64) }
                else if n.is_u64() { LnmpValue::Int(n.as_u64().unwrap() as i64) }
                else { LnmpValue::Float(n.as_f64().unwrap()) }
            }
            JsonValue::Bool(b) => LnmpValue::Bool(*b),
            JsonValue::String(s) => LnmpValue::String(s.clone()),
            JsonValue::Array(arr) => {
                // only string arrays supported prominently
                let mut out = Vec::new();
                for it in arr.iter() {
                    match it.as_str() {
                        Some(s) => out.push(s.to_string()),
                        None => return Err(format!("Array elements must be strings for F{}", fid)),
                    }
                }
                LnmpValue::StringArray(out)
            }
            JsonValue::Object(map) => {
                // nested record: parse nested object into LnmpRecord
                let nested = json_to_record(&JsonValue::Object(map.clone())).map_err(|e| format!("Nested record parse error: {}", e))?;
                LnmpValue::NestedRecord(Box::new(nested))
            }
            v => return Err(format!("Unsupported value type for F{}: {}", fid, v)),
        };
        rec.add_field(LnmpField { fid, value: lnmp_value });
    }
    Ok(rec)
}

#[wasm_bindgen]
pub fn parse(text: &str) -> Result<JsValue, JsValue> {
    let mut parser = Parser::new(text).map_err(|e| { let (code, details) = map_lnmp_err(&e); js_error(&code, &e.to_string(), details) })?;
    let record = parser.parse_record().map_err(|e| { let (code, details) = map_lnmp_err(&e); js_error(&code, &e.to_string(), details) })?;
    // If the parser returned an empty record but input was non-empty, treat it as a parse error
    if record.sorted_fields().is_empty() {
        if !text.trim().is_empty() {
            // Return a structured error similar to UnexpectedToken
            return Err(js_error("UNEXPECTED_TOKEN", "Strict parse failed: no fields parsed", Some(json!({ "reason": "no_fields_parsed" }))));
        }
    }
    let json = record_to_json(&record);
    to_value(&json).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn parse_lenient(text: &str) -> Result<JsValue, JsValue> {
    let mut parser = Parser::new_lenient(text).map_err(|e| { let (code, details) = map_lnmp_err(&e); js_error(&code, &e.to_string(), details) })?;
    let record = parser.parse_record().map_err(|e| { let (code, details) = map_lnmp_err(&e); js_error(&code, &e.to_string(), details) })?;
    if record.sorted_fields().is_empty() && !text.trim().is_empty() {
        return Err(js_error("UNEXPECTED_TOKEN", "Strict parse failed: no fields parsed", Some(json!({ "reason": "no_fields_parsed" }))));
    }
    let json = record_to_json(&record);
    to_value(&json).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn encode(obj: JsValue) -> Result<String, JsValue> {
    let json: JsonValue = from_value(obj).map_err(|e| js_error("INVALID_INPUT", &format!("Invalid input: {}", e), None))?;
    let rec = json_to_record(&json).map_err(|s| JsValue::from_str(&s))?;
    let enc = Encoder::new();
    Ok(enc.encode(&rec))
}

#[wasm_bindgen]
pub fn encode_binary(text: &str) -> Result<Vec<u8>, JsValue> {
    let enc = BinaryEncoder::new();
    enc.encode_text(text).map_err(|e| { let (code, details) = map_binary_err(&e); js_error(&code, &e.to_string(), details) })
}

#[wasm_bindgen]
pub fn encode_binary_lenient(text: &str) -> Result<Vec<u8>, JsValue> {
    let config = BinaryEncoderConfig::default().with_text_input_mode(TextInputMode::Lenient);
    let enc = BinaryEncoder::with_config(config);
    enc.encode_text(text).map_err(|e| { let (code, details) = map_binary_err(&e); js_error(&code, &e.to_string(), details) })
}

#[wasm_bindgen]
pub fn decode_binary(bin: &[u8]) -> Result<String, JsValue> {
    let decoder = BinaryDecoder::new();
    decoder.decode_to_text(bin).map_err(|e| { let (code, details) = map_binary_err(&e); js_error(&code, &e.to_string(), details) })
}

#[wasm_bindgen]
pub fn schema_describe(_mode: &str) -> Result<JsValue, JsValue> {
    // Try to load the example semantic dictionary (embedded at compile-time) and return it
    // as JSON. If parsing fails, fall back to the minimal mapping.
    match serde_yaml::from_str::<serde_json::Value>(EXAMPLE_SEMANTIC_DICTIONARY_YAML) {
        Ok(y) => to_value(&y).map_err(|e| JsValue::from_str(&e.to_string())),
        Err(_) => {
            let mut map = std::collections::BTreeMap::new();
            map.insert("7".to_string(), "boolean".to_string());
            map.insert("12".to_string(), "int".to_string());
            let mut wrapper = std::collections::BTreeMap::new();
            wrapper.insert("fields".to_string(), serde_json::to_value(map).unwrap_or(JsonValue::Null));
            to_value(&wrapper).map_err(|e| JsValue::from_str(&e.to_string()))
        }
    }
}

#[wasm_bindgen]
pub fn debug_explain(text: &str) -> Result<String, JsValue> {
    // Use parser then create a simple explanation
    let mut parser = Parser::new(text).map_err(|e| { let (code, details) = map_lnmp_err(&e); js_error(&code, &e.to_string(), details) })?;
    let record = parser.parse_record().map_err(|e| { let (code, details) = map_lnmp_err(&e); js_error(&code, &e.to_string(), details) })?;
    let mut lines = Vec::new();
    for f in record.sorted_fields() {
        let val = match &f.value {
            LnmpValue::Bool(b) => if *b { "1" } else { "0" }.to_string(),
            LnmpValue::Int(i) => i.to_string(),
            LnmpValue::Float(fl) => fl.to_string(),
            LnmpValue::String(s) => s.clone(),
            LnmpValue::StringArray(arr) => arr.join(","),
            LnmpValue::NestedRecord(nr) => format!("{{{}}}", serde_json::to_string(&record_to_json(nr)).unwrap_or_default()),
            LnmpValue::NestedArray(arr) => format!("[{}]", arr.iter().map(|r| serde_json::to_string(&record_to_json(r)).unwrap_or_default()).collect::<Vec<_>>().join(",")),
            // New v0.6 types
            LnmpValue::IntArray(arr) => format!("[{}]", arr.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",")),
            LnmpValue::FloatArray(arr) => format!("[{}]", arr.iter().map(|f| f.to_string()).collect::<Vec<_>>().join(",")),
            LnmpValue::BoolArray(arr) => format!("[{}]", arr.iter().map(|b| if *b { "1" } else { "0" }).collect::<Vec<_>>().join(",")),
            LnmpValue::Embedding(_) | LnmpValue::EmbeddingDelta(_) | LnmpValue::QuantizedEmbedding(_) => "[complex]".to_string(),
        };
        lines.push(format!("F{}={}    # {}", f.fid, val, f.fid));
    }
    Ok(lines.join("\n"))
}

#[wasm_bindgen]
pub fn sanitize(text: &str, options: Option<JsValue>) -> Result<JsValue, JsValue> {
    let config = sanitize_config_from_js(options)?;
    let sanitized = sanitize_lnmp_text(text, &config);
    let changed = !matches!(sanitized, std::borrow::Cow::Borrowed(_));
    let out = json!({
        "text": sanitized.into_owned(),
        "changed": changed,
        "config": config_to_json(&config),
    });
    to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
}

// ============================================================================
// ENVELOPE OPERATIONS - Operational Metadata Management
// ============================================================================

/// Wraps a record with envelope metadata
#[wasm_bindgen]
pub fn envelope_wrap(record_json: JsValue, metadata_json: JsValue) -> Result<JsValue, JsValue> {
    let record_val: JsonValue = from_value(record_json)
        .map_err(|e| js_error("INVALID_RECORD", &format!("Invalid record: {}", e), None))?;
    let record = json_to_record(&record_val)?;
    
    let metadata_val: JsonValue = from_value(metadata_json)
        .map_err(|e| js_error("INVALID_METADATA", &format!("Invalid metadata: {}", e), None))?;
    
    let mut metadata = EnvelopeMetadata::default();
    if let Some(obj) = metadata_val.as_object() {
        if let Some(ts) = obj.get("timestamp").and_then(|v| v.as_u64()) {
            metadata.timestamp = Some(ts);
        }
        if let Some(src) = obj.get("source").and_then(|v| v.as_str()) {
            metadata.source = Some(src.to_string());
        }
        if let Some(trace_id) = obj.get("trace_id").and_then(|v| v.as_str()) {
            metadata.trace_id = Some(trace_id.to_string());
        }
        if let Some(seq) = obj.get("sequence").and_then(|v| v.as_u64()) {
            metadata.sequence = Some(seq);
        }
    }
    
    let envelope = LnmpEnvelope { record, metadata };
    
    let result = json!({
        "record": record_to_json(&envelope.record),
        "metadata": {
            "timestamp": envelope.metadata.timestamp,
            "source": envelope.metadata.source,
            "trace_id": envelope.metadata.trace_id,
            "sequence": envelope.metadata.sequence,
        }
    });
    
    to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Encodes envelope metadata to binary TLV format
#[wasm_bindgen]
pub fn envelope_to_binary_tlv(metadata_json: JsValue) -> Result<Vec<u8>, JsValue> {
    let metadata_val: JsonValue = from_value(metadata_json)
        .map_err(|e| js_error("INVALID_METADATA", &format!("Invalid metadata: {}", e), None))?;
    
    let mut metadata = EnvelopeMetadata::default();
    if let Some(obj) = metadata_val.as_object() {
        if let Some(ts) = obj.get("timestamp").and_then(|v| v.as_u64()) {
            metadata.timestamp = Some(ts);
        }
        if let Some(src) = obj.get("source").and_then(|v| v.as_str()) {
            metadata.source = Some(src.to_string());
        }
        if let Some(trace_id) = obj.get("trace_id").and_then(|v| v.as_str()) {
            metadata.trace_id = Some(trace_id.to_string());
        }
        if let Some(seq) = obj.get("sequence").and_then(|v| v.as_u64()) {
            metadata.sequence = Some(seq);
        }
    }
    
    TlvEncoder::encode(&metadata)
        .map_err(|e| JsValue::from_str(&format!("TLV encoding error: {}", e)))
}

/// Decodes envelope metadata from binary TLV format
#[wasm_bindgen]
pub fn envelope_from_binary_tlv(tlv_bytes: &[u8]) -> Result<JsValue, JsValue> {
    let metadata = TlvDecoder::decode(tlv_bytes)
        .map_err(|e| JsValue::from_str(&format!("TLV decoding error: {}", e)))?;
    
    let result = json!({
        "timestamp": metadata.timestamp,
        "source": metadata.source,
        "trace_id": metadata.trace_id,
        "sequence": metadata.sequence,
    });
    
    to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

// ============================================================================
// NETWORK ROUTING - Intelligent Message Routing Decisions
// ============================================================================

/// Makes a routing decision for a network message (SendToLLM, ProcessLocally, Drop)
#[wasm_bindgen]
pub fn routing_decide(msg_json: JsValue, now_ms: f64) -> Result<String, JsValue> {
    let msg_val: JsonValue = from_value(msg_json)
        .map_err(|e| js_error("INVALID_MESSAGE", &format!("Invalid message: {}", e), None))?;
    
    let obj = msg_val.as_object()
        .ok_or_else(|| js_error("INVALID_MESSAGE", "Message must be an object", None))?;
    
    // Parse envelope
    let envelope_val = obj.get("envelope")
        .ok_or_else(|| js_error("MISSING_ENVELOPE", "Missing envelope field", None))?;
    let record_val = envelope_val.get("record")
        .ok_or_else(|| js_error("MISSING_RECORD", "Missing record in envelope", None))?;
    let record = json_to_record(record_val)?;
    
    let mut metadata = EnvelopeMetadata::default();
    if let Some(meta_obj) = envelope_val.get("metadata").and_then(|v| v.as_object()) {
        if let Some(ts) = meta_obj.get("timestamp").and_then(|v| v.as_u64()) {
            metadata.timestamp = Some(ts);
        }
        if let Some(src) = meta_obj.get("source").and_then(|v| v.as_str()) {
            metadata.source = Some(src.to_string());
        }
    }
    
    let envelope = LnmpEnvelope { record, metadata };
    
    // Parse message kind
    let kind_str = obj.get("kind").and_then(|v| v.as_str())
        .unwrap_or("Event");
    let kind = match kind_str {
        "Event" => MessageKind::Event,
        "State" => MessageKind::State,
        "Command" => MessageKind::Command,
        "Query" => MessageKind::Query,
        "Alert" => MessageKind::Alert,
        _ => MessageKind::Event,
    };
    
    let priority = obj.get("priority").and_then(|v| v.as_u64()).unwrap_or(100) as u8;
    let ttl_ms = obj.get("ttl_ms").and_then(|v| v.as_u64()).unwrap_or(5000) as u32;
    
    let net_msg = NetMessage::with_qos(envelope, kind, priority, ttl_ms);
    
    let policy = RoutingPolicy::default();
    let decision = policy.decide(&net_msg, now_ms as u64)
        .map_err(|e| JsValue::from_str(&format!("Routing error: {}", e)))?;
    
    let result = match decision {
        RoutingDecision::SendToLLM => "SendToLLM",
        RoutingDecision::ProcessLocally => "ProcessLocally",
        RoutingDecision::Drop => "Drop",
    };
    
    Ok(result.to_string())
}

/// Computes importance score for a message (0.0-1.0)
#[wasm_bindgen]
pub fn routing_importance_score(msg_json: JsValue, now_ms: f64) -> Result<f64, JsValue> {
    let msg_val: JsonValue = from_value(msg_json)
        .map_err(|e| js_error("INVALID_MESSAGE", &format!("Invalid message: {}", e), None))?;
    
    let obj = msg_val.as_object()
        .ok_or_else(|| js_error("INVALID_MESSAGE", "Message must be an object", None))?;
    
    // Parse envelope (simplified version)
    let envelope_val = obj.get("envelope")
        .ok_or_else(|| js_error("MISSING_ENVELOPE", "Missing envelope field", None))?;
    let record_val = envelope_val.get("record")
        .ok_or_else(|| js_error("MISSING_RECORD", "Missing record in envelope", None))?;
    let record = json_to_record(record_val)?;
    
    let mut metadata = EnvelopeMetadata::default();
    if let Some(meta_obj) = envelope_val.get("metadata").and_then(|v| v.as_object()) {
        if let Some(ts) = meta_obj.get("timestamp").and_then(|v| v.as_u64()) {
            metadata.timestamp = Some(ts);
        }
    }
    
    let envelope = LnmpEnvelope { record, metadata };
    let kind_str = obj.get("kind").and_then(|v| v.as_str()).unwrap_or("Event");
    let kind = match kind_str {
        "Event" => MessageKind::Event,
        "State" => MessageKind::State,
        "Command" => MessageKind::Command,
        "Query" => MessageKind::Query,
        "Alert" => MessageKind::Alert,
        _ => MessageKind::Event,
    };
    
    let priority = obj.get("priority").and_then(|v| v.as_u64()).unwrap_or(100) as u8;
    let ttl_ms = obj.get("ttl_ms").and_then(|v| v.as_u64()).unwrap_or(5000) as u32;
    
    let net_msg = NetMessage::with_qos(envelope, kind, priority, ttl_ms);
    let policy = RoutingPolicy::default();
    
    policy.base_importance(&net_msg, now_ms as u64)
        .map_err(|e| JsValue::from_str(&format!("Importance score error: {}", e)))
}

// ============================================================================
// TRANSPORT HEADERS - Multi-Protocol Header Mappings
// ============================================================================

/// Converts envelope to HTTP headers
#[wasm_bindgen]
pub fn transport_to_http_headers(envelope_json: JsValue) -> Result<JsValue, JsValue> {
    let envelope_val: JsonValue = from_value(envelope_json)
        .map_err(|e| js_error("INVALID_ENVELOPE", &format!("Invalid envelope: {}", e), None))?;
    
    let record_val = envelope_val.get("record")
        .ok_or_else(|| js_error("MISSING_RECORD", "Missing record in envelope", None))?;
    let record = json_to_record(record_val)?;
    
    let mut metadata = EnvelopeMetadata::default();
    if let Some(meta_obj) = envelope_val.get("metadata").and_then(|v| v.as_object()) {
        if let Some(ts) = meta_obj.get("timestamp").and_then(|v| v.as_u64()) {
            metadata.timestamp = Some(ts);
        }
        if let Some(src) = meta_obj.get("source").and_then(|v| v.as_str()) {
            metadata.source = Some(src.to_string());
        }
        if let Some(trace_id) = meta_obj.get("trace_id").and_then(|v| v.as_str()) {
            metadata.trace_id = Some(trace_id.to_string());
        }
        if let Some(seq) = meta_obj.get("sequence").and_then(|v| v.as_u64()) {
            metadata.sequence = Some(seq);
        }
    }
    
    let envelope = LnmpEnvelope { record, metadata };
    
    // Convert to HTTP headers (simplified - returns JSON map)
    let mut headers = serde_json::Map::new();
    
    if let Some(ts) = envelope.metadata.timestamp {
        headers.insert("X-LNMP-Timestamp".to_string(), JsonValue::String(ts.to_string()));
    }
    if let Some(ref src) = envelope.metadata.source {
        headers.insert("X-LNMP-Source".to_string(), JsonValue::String(src.clone()));
    }
    if let Some(ref trace_id) = envelope.metadata.trace_id {
        headers.insert("X-LNMP-Trace-Id".to_string(), JsonValue::String(trace_id.clone()));
        // Generate W3C traceparent
        let traceparent = format!("00-{}-{}-01", 
            trace_id.chars().take(32).collect::<String>().to_lowercase(),
            "0123456789abcdef");
        headers.insert("traceparent".to_string(), JsonValue::String(traceparent));
    }
    if let Some(seq) = envelope.metadata.sequence {
        headers.insert("X-LNMP-Sequence".to_string(), JsonValue::String(seq.to_string()));
    }
    
    to_value(&JsonValue::Object(headers)).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Parses HTTP headers to envelope metadata
#[wasm_bindgen]
pub fn transport_from_http_headers(headers_json: JsValue) -> Result<JsValue, JsValue> {
    let headers_val: JsonValue = from_value(headers_json)
        .map_err(|e| js_error("INVALID_HEADERS", &format!("Invalid headers: {}", e), None))?;
    
    let headers_obj = headers_val.as_object()
        .ok_or_else(|| js_error("INVALID_HEADERS", "Headers must be an object", None))?;
    
    let mut metadata = EnvelopeMetadata::default();
    
    if let Some(ts_str) = headers_obj.get("X-LNMP-Timestamp").and_then(|v| v.as_str()) {
        if let Ok(ts) = ts_str.parse::<u64>() {
            metadata.timestamp = Some(ts);
        }
    }
    if let Some(src) = headers_obj.get("X-LNMP-Source").and_then(|v| v.as_str()) {
        metadata.source = Some(src.to_string());
    }
    if let Some(trace_id) = headers_obj.get("X-LNMP-Trace-Id").and_then(|v| v.as_str()) {
        metadata.trace_id = Some(trace_id.to_string());
    }
    if let Some(seq_str) = headers_obj.get("X-LNMP-Sequence").and_then(|v| v.as_str()) {
        if let Ok(seq) = seq_str.parse::<u64>() {
            metadata.sequence = Some(seq);
        }
    }
    
    let result = json!({
        "timestamp": metadata.timestamp,
        "source": metadata.source,
        "trace_id": metadata.trace_id,
        "sequence": metadata.sequence,
    });
    
    to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

// ============================================================================
// EMBEDDING OPERATIONS - Vector Delta Compression
// ============================================================================

/// Computes delta between two embedding vectors
#[wasm_bindgen]
pub fn embedding_compute_delta(base: Vec<f32>, updated: Vec<f32>) -> Result<JsValue, JsValue> {
    if base.len() != updated.len() {
        return Err(js_error("DIMENSION_MISMATCH", 
            &format!("Base and updated vectors must have same dimension: {} vs {}", base.len(), updated.len()), 
            None));
    }
    
    let base_vec = Vector::from_f32(base.clone());
    let updated_vec = Vector::from_f32(updated.clone());
    
    let delta = VectorDelta::from_vectors(&base_vec, &updated_vec, 0)
        .map_err(|e| JsValue::from_str(&format!("Delta computation error: {}", e)))?;
    
    let changes: Vec<_> = delta.changes.iter().map(|change| {
        json!({
            "index": change.index,
            "delta": change.delta,
        })
    }).collect();
    
    let change_ratio = delta.change_ratio(base_vec.dim);
    let compression_ratio = (1.0 - change_ratio).clamp(0.0, 1.0);
    
    let result = json!({
        "changes": changes,
        "compressionRatio": compression_ratio,
        "dimension": base.len(),
    });
    
    to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Applies delta to base vector
#[wasm_bindgen]
pub fn embedding_apply_delta(base: Vec<f64>, delta_json: JsValue) -> Result<Vec<f64>, JsValue> {
    let delta_val: JsonValue = from_value(delta_json)
        .map_err(|e| js_error("INVALID_DELTA", &format!("Invalid delta: {}", e), None))?;
    
    let changes_arr = delta_val.get("changes").and_then(|v| v.as_array())
        .ok_or_else(|| js_error("MISSING_CHANGES", "Missing changes array in delta", None))?;
    
    let mut result = base.clone();
    
    for change in changes_arr {
        let index = change.get("index").and_then(|v| v.as_u64())
            .ok_or_else(|| js_error("INVALID_CHANGE", "Missing or invalid index", None))? as usize;
        let delta_val = change.get("delta").and_then(|v| v.as_f64())
            .ok_or_else(|| js_error("INVALID_CHANGE", "Missing or invalid delta", None))?;

        if index < result.len() {
            result[index] += delta_val; // Apply delta as addition
        }
    }
    
    const PRECISION_SCALE: f64 = 1_000_000.0;
    for val in result.iter_mut() {
        *val = (*val * PRECISION_SCALE).round() / PRECISION_SCALE;
    }

    Ok(result)
}

// ============================================================================
// SPATIAL STREAMING - 3D Position Encoding
// ============================================================================

/// Encodes spatial positions as snapshot
#[wasm_bindgen]
pub fn spatial_encode_snapshot(positions: Vec<f32>) -> Result<Vec<u8>, JsValue> {
    // Simplified snapshot encoding (just raw bytes for now)
    // In real implementation, would use SpatialFrame::Snapshot
    let mut result = Vec::new();
    result.push(0x00); // Snapshot marker
    
    for pos in positions {
        result.extend_from_slice(&pos.to_le_bytes());
    }
    
    Ok(result)
}

/// Encodes spatial delta between two position arrays
#[wasm_bindgen]
pub fn spatial_encode_delta(prev: Vec<f32>, curr: Vec<f32>) -> Result<Vec<u8>, JsValue> {
    if prev.len() != curr.len() {
        return Err(js_error("DIMENSION_MISMATCH", 
            &format!("Previous and current position arrays must have same length: {} vs {}", prev.len(), curr.len()), 
            None));
    }
    
    // Simplified delta encoding
    let mut result = Vec::new();
    result.push(0x01); // Delta marker
    
    let mut changed_count = 0u16;
    let count_pos = result.len();
    result.extend_from_slice(&changed_count.to_le_bytes());
    
    for (i, (p, c)) in prev.iter().zip(curr.iter()).enumerate() {
        if (p - c).abs() > 0.001 {
            result.extend_from_slice(&(i as u16).to_le_bytes());
            result.extend_from_slice(&c.to_le_bytes());
            changed_count += 1;
        }
    }
    
    // Update count
    result[count_pos..count_pos+2].copy_from_slice(&changed_count.to_le_bytes());
    
    Ok(result)
}

// ============================================================================
// CONTEXT SCORING - SFE Freshness and Importance
// ============================================================================

/// Scores envelope for LLM context selection
#[wasm_bindgen]
pub fn context_score_envelope(envelope_json: JsValue, now_ms: f64) -> Result<JsValue, JsValue> {
    let envelope_val: JsonValue = from_value(envelope_json)
        .map_err(|e| js_error("INVALID_ENVELOPE", &format!("Invalid envelope: {}", e), None))?;
    
    let record_val = envelope_val.get("record")
        .ok_or_else(|| js_error("MISSING_RECORD", "Missing record in envelope", None))?;
    let record = json_to_record(record_val)?;
    
    let mut metadata = EnvelopeMetadata::default();
    if let Some(meta_obj) = envelope_val.get("metadata").and_then(|v| v.as_object()) {
        if let Some(ts) = meta_obj.get("timestamp").and_then(|v| v.as_u64()) {
            metadata.timestamp = Some(ts);
        }
        if let Some(src) = meta_obj.get("source").and_then(|v| v.as_str()) {
            metadata.source = Some(src.to_string());
        }
    }
    
    let envelope = LnmpEnvelope { record, metadata };
    
    let scorer = ContextScorer::new();
    let profile = scorer.score_envelope(&envelope, now_ms as u64);
    
    let result = json!({
        "freshnessScore": profile.freshness_score,
        "importance": profile.importance,
        "riskLevel": format!("{:?}", profile.risk_level),
        "confidence": profile.confidence,
        "compositeScore": profile.composite_score(),
    });
    
    to_value(&result).map_err(|e| JsValue::from_str(&e.to_string()))
}

// End of exports


#[cfg(test)]
mod tests {
    use super::*;
    use lnmp::codec::binary::BinaryEncoder;
    use lnmp::codec::binary::error::BinaryError;

    #[test]
    fn encode_text_with_unquoted_inner_quotes_fails() {
        let enc = BinaryEncoder::new();
        // F2 contains an inner double quote without delimiting quotes -> should fail with TextFormatError
        let text = "F1=1\nF2=Hello \"world\""; // actual content: F2=Hello "world"
        let r = enc.encode_text(text);
        assert!(r.is_err(), "Expected error for unquoted inner quote");
        match r.err().unwrap() {
            BinaryError::TextFormatError{ source: _ } => { /* expected */ }
            e => panic!("Unexpected error variant: {:?}", e),
        }
    }

    #[test]
    fn encode_text_with_quoted_inner_quotes_succeeds() {
        let enc = BinaryEncoder::new();
        // Properly quoted and escaped F2 value
        let text = "F1=1\nF2=\"Hello \\\"world\\\"\""; // F2="Hello \"world\""
        let r = enc.encode_text(text);
        assert!(r.is_ok(), "Expected success for properly quoted F2");
    }
}
