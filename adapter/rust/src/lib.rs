use wasm_bindgen::prelude::*;
use serde_wasm_bindgen::{to_value, from_value};
use serde_json::{Value as JsonValue, Number as JsonNumber, json};
use serde::Deserialize;

use lnmp_core::{LnmpRecord, LnmpField, LnmpValue};
use lnmp_codec::{Parser, Encoder};
use lnmp_codec::binary::{BinaryEncoder, BinaryDecoder};
use lnmp_codec::binary::encoder::EncoderConfig as BinaryEncoderConfig;
use lnmp_codec::config::TextInputMode;
use lnmp_sanitize::{sanitize_lnmp_text, SanitizationConfig, SanitizationLevel};
use serde_yaml;
// Include the example semantic dictionary at compile time to return authoritative schema info
const EXAMPLE_SEMANTIC_DICTIONARY_YAML: &str = include_str!("../../../../lnmp-protocol/examples/examples/semantic_dictionary.yaml");

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

fn map_lnmp_err(err: &lnmp_codec::error::LnmpError) -> (String, Option<JsonValue>) {
    use lnmp_codec::error::LnmpError::*;
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
    }
}

fn map_binary_err(err: &lnmp_codec::binary::error::BinaryError) -> (String, Option<JsonValue>) {
    use lnmp_codec::binary::error::BinaryError::*;
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
// End of exports

#[cfg(test)]
mod tests {
    use super::*;
    use lnmp_codec::binary::BinaryEncoder;
    use lnmp_codec::binary::error::BinaryError;

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
