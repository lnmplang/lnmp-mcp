import { routingDecideTool, routingImportanceTool } from "../../src/tools/networkRouting";
import { lnmp } from "../../src/bindings/lnmp";

describe("lnmp.network tools", () => {
    beforeAll(async () => {
        await lnmp.ready();
    });

    describe("lnmp.network.decide", () => {
        it("should route Alert with high priority to LLM", async () => {
            const message = {
                envelope: { record: { 12: 42 }, metadata: { timestamp: Date.now() } },
                kind: "Alert",
                priority: 250
            };

            const result = await routingDecideTool.handler({ message } as any);
            expect(result.decision).toBe("SendToLLM");
        });

        it("should process local Command", async () => {
            const message = {
                envelope: { record: { 12: 42 }, metadata: { timestamp: Date.now() } },
                kind: "Command",
                priority: 100
            };

            const result = await routingDecideTool.handler({ message } as any);
            expect(result.decision).toBe("ProcessLocally");
        });
    });

    describe("lnmp.network.importance", () => {
        it("should compute importance score", async () => {
            const message = {
                envelope: { record: { 12: 42 }, metadata: { timestamp: Date.now() } },
                kind: "Event",
                priority: 150
            };

            const result = await routingImportanceTool.handler({ message } as any);
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(1);
        });
    });
});
