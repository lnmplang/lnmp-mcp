import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const contextScoreTool: Tool = {
    name: "lnmp.context.score",
    description: "Scores LNMP envelope for LLM context selection (freshness + importance)",
    inputSchema: {
        type: "object",
        properties: {
            envelope: {
                type: "object",
                description: "LNMP envelope with metadata",
            },
            now: {
                type: "number",
                description: "Current timestamp (epoch ms), defaults to Date.now()",
            },
        },
        required: ["envelope"],
    },
    outputSchema: {
        type: "object",
        properties: {
            scores: {
                type: "object",
                properties: {
                    freshnessScore: { type: "number", description: "0.0-1.0" },
                    importance: { type: "number", description: "0-255" },
                    riskLevel: { type: "string" },
                    confidence: { type: "number", description: "0.0-1.0" },
                    compositeScore: { type: "number", description: "0.0-1.0, weighted combination" },
                },
            },
        },
    },
    handler: async ({ envelope, now }) => {
        await lnmp.ready();

        const nowMs = now || Date.now();
        // @ts-ignore - New WASM export
        const scores = (lnmp as any).contextScoreEnvelope(envelope, nowMs);

        return { scores };
    },
};
