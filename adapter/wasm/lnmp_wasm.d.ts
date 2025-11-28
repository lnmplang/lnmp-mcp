/* tslint:disable */
/* eslint-disable */
export function encode_binary_lenient(text: string): Uint8Array;
/**
 * Computes importance score for a message (0.0-1.0)
 */
export function routing_importance_score(msg_json: any, now_ms: number): number;
/**
 * Scores envelope for LLM context selection
 */
export function context_score_envelope(envelope_json: any, now_ms: number): any;
/**
 * Encodes envelope metadata to binary TLV format
 */
export function envelope_to_binary_tlv(metadata_json: any): Uint8Array;
export function sanitize(text: string, options?: any | null): any;
/**
 * Decodes envelope metadata from binary TLV format
 */
export function envelope_from_binary_tlv(tlv_bytes: Uint8Array): any;
/**
 * Wraps a record with envelope metadata
 */
export function envelope_wrap(record_json: any, metadata_json: any): any;
export function parse(text: string): any;
export function encode_binary(text: string): Uint8Array;
/**
 * Encodes spatial positions as snapshot
 */
export function spatial_encode_snapshot(positions: Float32Array): Uint8Array;
/**
 * Encodes spatial delta between two position arrays
 */
export function spatial_encode_delta(prev: Float32Array, curr: Float32Array): Uint8Array;
/**
 * Makes a routing decision for a network message (SendToLLM, ProcessLocally, Drop)
 */
export function routing_decide(msg_json: any, now_ms: number): string;
/**
 * Applies delta to base vector
 */
export function embedding_apply_delta(base: Float64Array, delta_json: any): Float64Array;
export function decode_binary(bin: Uint8Array): string;
/**
 * Parses HTTP headers to envelope metadata
 */
export function transport_from_http_headers(headers_json: any): any;
export function encode(obj: any): string;
/**
 * Computes delta between two embedding vectors
 */
export function embedding_compute_delta(base: Float32Array, updated: Float32Array): any;
/**
 * Converts envelope to HTTP headers
 */
export function transport_to_http_headers(envelope_json: any): any;
export function parse_lenient(text: string): any;
export function debug_explain(text: string): string;
export function schema_describe(_mode: string): any;
