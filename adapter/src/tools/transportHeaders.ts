import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const transportToHttpTool: Tool = {
    name: "lnmp.transport.toHttp",
    description: "Converts LNMP envelope metadata to HTTP headers (X-LNMP-*, traceparent)",
    inputSchema: {
        type: "object",
        properties: {
            envelope: {
                type: "object",
                description: "LNMP envelope with metadata",
            },
        },
        required: ["envelope"],
    },
    outputSchema: {
        type: "object",
        properties: {
            headers: {
                type: "object",
                description: "HTTP headers (X-LNMP-Timestamp, X-LNMP-Source, traceparent, etc.)",
            },
        },
    },
    handler: async ({ envelope }) => {
        await lnmp.ready();

        // @ts-ignore - New WASM export
        const headers = (lnmp as any).transportToHttpHeaders(envelope);

        return { headers };
    },
};

export const transportFromHttpTool: Tool = {
    name: "lnmp.transport.fromHttp",
    description: "Parses HTTP headers to extract envelope metadata",
    inputSchema: {
        type: "object",
        properties: {
            headers: {
                type: "object",
                description: "HTTP headers object",
            },
        },
        required: ["headers"],
    },
    outputSchema: {
        type: "object",
        properties: {
            metadata: {
                type: "object",
                description: "Extracted envelope metadata",
            },
        },
    },
    handler: async ({ headers }) => {
        await lnmp.ready();

        // @ts-ignore - New WASM export
        const metadata = (lnmp as any).transportFromHttpHeaders(headers);

        return { metadata };
    },
};
