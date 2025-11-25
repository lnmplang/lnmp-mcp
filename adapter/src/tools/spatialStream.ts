import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const spatialEncodeTool: Tool = {
    name: "lnmp.spatial.encode",
    description: "Encodes spatial data (robot positions, 3D coordinates) with snapshot or delta compression",
    inputSchema: {
        type: "object",
        properties: {
            positions: {
                type: "array",
                items: { type: "number" },
                description: "Position array (e.g., [x1, y1, z1, x2, y2, z2, ...])",
            },
            mode: {
                type: "string",
                enum: ["snapshot", "delta"],
                description: "Encoding mode",
            },
            previousPositions: {
                type: "array",
                items: { type: "number" },
                description: "Previous positions (required for delta mode)",
            },
        },
        required: ["positions"],
    },
    outputSchema: {
        type: "object",
        properties: {
            binary: {
                type: "string",
                description: "Base64-encoded binary data",
            },
            mode: {
                type: "string",
            },
        },
    },
    handler: async ({ positions, mode, previousPositions }) => {
        await lnmp.ready();

        let binaryData: Uint8Array;

        if (mode === "delta" && previousPositions) {
            // @ts-ignore - New WASM export
            binaryData = (lnmp as any).spatialEncodeDelta(previousPositions, positions);
        } else {
            // @ts-ignore - New WASM export
            binaryData = (lnmp as any).spatialEncodeSnapshot(positions);
        }

        // Convert to base64
        const binary = Buffer.from(binaryData).toString("base64");

        return { binary, mode: mode || "snapshot" };
    },
};
