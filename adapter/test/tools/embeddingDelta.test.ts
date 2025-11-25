import { embeddingComputeDeltaTool, embeddingApplyDeltaTool } from "../../src/tools/embeddingDelta";
import { lnmp } from "../../src/bindings/lnmp";

describe("lnmp.embedding tools", () => {
    beforeAll(async () => {
        await lnmp.ready();
    });

    describe("lnmp.embedding.computeDelta", () => {
        it("should compute delta for 1% change", async () => {
            const base = [0.1, 0.2, 0.3, 0.4, 0.5];
            const updated = [0.1, 0.21, 0.3, 0.4, 0.5]; // 1/5 = 20% change

            const result = await embeddingComputeDeltaTool.handler({ base, updated } as any);

            expect(result.delta).toBeDefined();
            expect(result.delta.changes.length).toBe(1);
            expect(result.delta.changes[0].index).toBe(1);
            expect(result.delta.changes[0].delta).toBeCloseTo(0.01, 5);
        });

        it("should have high compression ratio for small changes", async () => {
            const base = Array(100).fill(0).map((_, i) => i / 100);
            const updated = [...base];
            updated[50] += 0.1; // Single change

            const result = await embeddingComputeDeltaTool.handler({ base, updated } as any);

            expect(result.delta.compressionRatio).toBeGreaterThan(0.9); // > 90% compression
        });
    });

    describe("lnmp.embedding.applyDelta", () => {
        it("should reconstruct vector from delta", async () => {
            const base = [0.1, 0.2, 0.3];
            const updated = [0.1, 0.25, 0.3];

            // Compute delta
            const deltaResult = await embeddingComputeDeltaTool.handler({ base, updated } as any);

            // Apply delta
            const result = await embeddingApplyDeltaTool.handler({
                base,
                delta: deltaResult.delta
            } as any);

            expect(result.vector).toEqual(updated);
        });
    });
});
