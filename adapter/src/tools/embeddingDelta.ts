import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const embeddingComputeDeltaTool: Tool = {
    name: "lnmp.embedding.computeDelta",
    description: "Computes delta between two embedding vectors (80-95% size reduction for 1-5% changes)",
    inputSchema: {
        type: "object",
        properties: {
            base: {
                type: "array",
                items: { type: "number" },
                description: "Base embedding vector",
            },
            updated: {
                type: "array",
                items: { type: "number" },
                description: "Updated embedding vector (same dimension as base)",
            },
        },
        required: ["base", "updated"],
    },
    outputSchema: {
        type: "object",
        properties: {
            delta: {
                type: "object",
                properties: {
                    changes: { type: "array" },
                    compressionRatio: { type: "number" },
                    dimension: { type: "number" },
                },
            },
        },
    },
    handler: async ({ base, updated }) => {
        await lnmp.ready();

        // @ts-ignore - New WASM export
        const delta = (lnmp as any).embeddingComputeDelta(base, updated);

        return { delta };
    },
};

export const embeddingApplyDeltaTool: Tool = {
    name: "lnmp.embedding.applyDelta",
    description: "Applies delta to base vector to reconstruct updated vector",
    inputSchema: {
        type: "object",
        properties: {
            base: {
                type: "array",
                items: { type: "number" },
                description: "Base embedding vector",
            },
            delta: {
                type: "object",
                description: "Delta object from computeDelta",
            },
        },
        required: ["base", "delta"],
    },
    outputSchema: {
        type: "object",
        properties: {
            vector: {
                type: "array",
                items: { type: "number" },
                description: "Reconstructed vector",
            },
        },
    },
    handler: async ({ base, delta }) => {
        await lnmp.ready();

        // @ts-ignore - New WASM export
        const vector = (lnmp as any).embeddingApplyDelta(base, delta);

        return { vector };
    },
};
