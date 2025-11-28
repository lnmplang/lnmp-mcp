import { transportToHttpTool, transportFromHttpTool } from "../../src/tools/transportHeaders";
import { envelopeWrapTool } from "../../src/tools/envelope";
import { lnmp } from "../../src/bindings/lnmp";

describe("lnmp.transport.* tools", () => {
    beforeAll(async () => {
        await lnmp.ready();
    });

    test("transportToHttp converts metadata to HTTP headers", async () => {
        const envelopeResult = await envelopeWrapTool.handler({
            record: { 12: 42 },
            metadata: {
                source: "tester",
                timestamp: 1710000000000,
                trace_id: "trace-123",
                sequence: 9,
            },
        } as any);

        const headersResult = await transportToHttpTool.handler({
            envelope: envelopeResult.envelope,
        } as any);

        expect(headersResult.headers["X-LNMP-Source"]).toBe("tester");
        expect(headersResult.headers["X-LNMP-Timestamp"]).toBe("1710000000000");
        expect(headersResult.headers["X-LNMP-Trace-Id"]).toBe("trace-123");
        expect(headersResult.headers["X-LNMP-Sequence"]).toBe("9");
        expect(headersResult.headers.traceparent).toMatch(/^00-trace-123-/);
    });

    test("transportFromHttp reconstructs metadata from headers", async () => {
        const headers = {
            "X-LNMP-Source": "tester",
            "X-LNMP-Timestamp": "1710000000000",
            "X-LNMP-Trace-Id": "trace-123",
            "X-LNMP-Sequence": "3",
            traceparent: "00-trace-123-0123456789abcdef-01",
        };

        const metadataResult = await transportFromHttpTool.handler({ headers } as any);

        expect(metadataResult.metadata.source).toBe("tester");
        expect(metadataResult.metadata.timestamp).toBe(1710000000000);
        expect(metadataResult.metadata.trace_id).toBe("trace-123");
        expect(metadataResult.metadata.sequence).toBe(3);
    });
});
