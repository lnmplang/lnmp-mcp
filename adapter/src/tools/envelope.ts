import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const envelopeWrapTool: Tool = {
    name: "lnmp.envelope.wrap",
    description: "Wraps LNMP record with operational metadata (timestamp, source, trace_id, sequence)",
    inputSchema: {
        type: "object",
        properties: {
            record: {
                type: "object",
                description: "LNMP record as field-value map (e.g., {12: 42, 7: true})",
            },
            metadata: {
                type: "object",
                properties: {
                    timestamp: { type: "number", description: "Unix epoch milliseconds" },
                    source: { type: "string", description: "Service/agent identifier" },
                    trace_id: { type: "string", description: "Distributed tracing ID (W3C compatible)" },
                    sequence: { type: "number", description: "Sequence number for ordering" },
                },
                description: "Optional operational metadata",
            },
        },
        required: ["record"],
    },
    outputSchema: {
        type: "object",
        properties: {
            envelope: {
                type: "object",
                description: "Envelope with record and metadata",
            },
        },
    },
    handler: async ({ record, metadata }) => {
        await lnmp.ready();

        // @ts-ignore - New WASM export, will be available after bindings update
        const envelope = (lnmp as any).envelopeWrap(record, metadata || {});

        return { envelope };
    },
};
