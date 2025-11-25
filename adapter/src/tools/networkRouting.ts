import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const routingDecideTool: Tool = {
    name: "lnmp.network.decide",
    description: "Routes message to LLM or local processing using ECO policy (90%+ API call reduction)",
    inputSchema: {
        type: "object",
        properties: {
            message: {
                type: "object",
                properties: {
                    envelope: {
                        type: "object",
                        description: "LNMP envelope with record and metadata",
                    },
                    kind: {
                        type: "string",
                        enum: ["Event", "State", "Command", "Query", "Alert"],
                        description: "Message semantic type",
                    },
                    priority: {
                        type: "number",
                        minimum: 0,
                        maximum: 255,
                        description: "Priority level (0=lowest, 255=critical)",
                    },
                    ttl_ms: {
                        type: "number",
                        description: "Time-to-live in milliseconds",
                    },
                },
                required: ["envelope", "kind"],
            },
            now: {
                type: "number",
                description: "Current timestamp (epoch ms), defaults to Date.now()",
            },
        },
        required: ["message"],
    },
    outputSchema: {
        type: "object",
        properties: {
            decision: {
                type: "string",
                enum: ["SendToLLM", "ProcessLocally", "Drop"],
                description: "Routing decision",
            },
        },
    },
    handler: async ({ message, now }) => {
        await lnmp.ready();

        const nowMs = now || Date.now();
        // @ts-ignore - New WASM export
        const decision = (lnmp as any).routingDecide(message, nowMs);

        return { decision };
    },
};

export const routingImportanceTool: Tool = {
    name: "lnmp.network.importance",
    description: "Computes importance score for message (0.0-1.0), combining priority and SFE metrics",
    inputSchema: {
        type: "object",
        properties: {
            message: {
                type: "object",
                description: "Network message with envelope, kind, priority",
            },
            now: {
                type: "number",
                description: "Current timestamp (epoch ms)",
            },
        },
        required: ["message"],
    },
    outputSchema: {
        type: "object",
        properties: {
            score: {
                type: "number",
                description: "Importance score (0.0-1.0)",
            },
        },
    },
    handler: async ({ message, now }) => {
        await lnmp.ready();

        const nowMs = now || Date.now();
        // @ts-ignore - New WASM export
        const score = (lnmp as any).routingImportanceScore(message, nowMs);

        return { score };
    },
};
