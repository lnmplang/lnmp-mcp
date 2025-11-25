import { envelopeWrapTool } from "../../src/tools/envelope";
import { lnmp } from "../../src/bindings/lnmp";

describe("lnmp.envelope.wrap", () => {
    beforeAll(async () => {
        await lnmp.ready();
    });

    it("should wrap record with minimal metadata", async () => {
        const record = { 12: 42, 7: true };
        const result = await envelopeWrapTool.handler({ record, metadata: {} } as any);

        expect(result.envelope).toBeDefined();
        expect(result.envelope.record).toEqual(record);
    });

    it("should wrap record with full metadata", async () => {
        const record = { 12: 42 };
        const metadata = {
            timestamp: 1732373147000,
            source: "test-agent",
            trace_id: "abc123",
            sequence: 1
        };

        const result = await envelopeWrapTool.handler({ record, metadata } as any);

        expect(result.envelope.metadata.timestamp).toBe(1732373147000);
        expect(result.envelope.metadata.source).toBe("test-agent");
        expect(result.envelope.metadata.trace_id).toBe("abc123");
    });
});
