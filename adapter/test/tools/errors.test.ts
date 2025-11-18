import { lnmp } from '../../src/bindings/lnmp';

describe('lnmp error mapping', () => {
  beforeAll(async () => {
    await lnmp.initLnmpWasm({ path: __dirname + '/../../src/wasm/lnmp_wasm_bg.wasm', force: true });
  });

  test('decodeBinary returns structured error for unsupported version', () => {
    const invalid = Buffer.from([0xFF, 0x00, 0x00]);
    const b64 = invalid.toString('base64');
    expect(() => lnmp.decodeBinary(b64)).toThrow();
    try {
      lnmp.decodeBinary(b64);
    } catch (err) {
      // Error should carry a `code` property
      expect(err).toBeInstanceOf(Error);
      expect((err as any).code).toBeDefined();
      // Either UNSUPPORTED_VERSION or BINARY_ERROR depending on mapping
      expect(['UNSUPPORTED_VERSION', 'BINARY_ERROR']).toContain((err as any).code);
      expect((err as any).details).toBeDefined();
    }
  });

  test('debugExplain returns structured error for parsing invalid input', () => {
    const invalidText = 'notlnmp';
    expect(() => lnmp.debugExplain(invalidText)).toThrow();
    try {
      lnmp.debugExplain(invalidText);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as any).code).toBeDefined();
      expect((err as any).details).toBeDefined();
      // Common parse errors are UNEXPECTED_TOKEN or INVALID_FIELD_ID
      expect(['UNEXPECTED_TOKEN', 'INVALID_FIELD_ID']).toContain((err as any).code);
    }
  });
});
