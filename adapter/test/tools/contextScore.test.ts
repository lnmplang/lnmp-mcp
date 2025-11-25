import { contextScoreTool } from "../../src/tools/contextScore";
import { lnmp } from "../../src/bindings/lnmp";

describe("lnmp.context.score", () => {
    beforeAll(async () => {
        await lnmp.ready();
    });

    it("should score envelope with fresh timestamp", async () => {
        const envelope = {
            record: { 12: 42 },
            metadata: { timestamp: Date.now() }
        };

        const result = await contextScoreTool.handler({ envelope } as any);

        expect(result.scores.freshnessScore).toBeGreaterThan(0.8); // Fresh
        expect(result.scores.compositeScore).toBeGreaterThan(0);
        expect(result.scores.compositeScore).toBeLessThanOrEqual(1);
    });

    it("should score old envelope with low freshness", async () => {
        const envelope = {
            record: { 12: 42 },
            metadata: { timestamp: Date.now() - 86400000 } // 1 day ago
        };

        const result = await contextScoreTool.handler({ envelope } as any);

        expect(result.scores.freshnessScore).toBeLessThan(0.5);
    });

    it("should include importance and risk level", async () => {
        const envelope = {
            record: { 12: 42 },
            metadata: { timestamp: Date.now() }
        };

        const result = await contextScoreTool.handler({ envelope } as any);

        expect(result.scores.importance).toBeDefined();
        expect(result.scores.riskLevel).toBeDefined();
        expect(result.scores.confidence).toBeGreaterThanOrEqual(0);
    });
});
