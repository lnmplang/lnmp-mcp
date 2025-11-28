import { spatialEncodeTool } from "../../src/tools/spatialStream";
import { lnmp } from "../../src/bindings/lnmp";

describe("lnmp.spatial.encode", () => {
    beforeAll(async () => {
        await lnmp.ready();
    });

    test("encodes snapshot positions with deterministic base64", async () => {
        const result = await spatialEncodeTool.handler({
            positions: [0, 1, 2],
            mode: "snapshot",
        } as any);

        expect(result.mode).toBe("snapshot");
        expect(result.binary).toBe("AAAAAAAAAIA/AAAAQA==");
    });

    test("encodes delta positions when previous snapshot provided", async () => {
        const result = await spatialEncodeTool.handler({
            positions: [0, 1, 2.5],
            mode: "delta",
            previousPositions: [0, 1, 2],
        } as any);

        expect(result.mode).toBe("delta");
        expect(result.binary).toBe("AQEAAgAAACBA");
    });
});
