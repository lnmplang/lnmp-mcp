import { lnmp } from '../../src/bindings/lnmp';

describe('lnmp binary', () => {
  beforeAll(async () => {
    await lnmp.initLnmpWasm({ path: __dirname + '/../../src/wasm/lnmp_wasm_bg.wasm', force: true });
  });

  test('encodeBinary -> decodeBinary roundtrip', async () => {
    const text = 'F7=1\nF12=14532';
    const base64 = Buffer.from(lnmp.encodeBinary(text)).toString('base64');
    const decoded = lnmp.decodeBinary(base64);
    expect(decoded).toContain('F7=1');
    expect(decoded).toContain('F12=14532');
  });

  test('decodeBinary handles invalid base64 gracefully', async () => {
    expect(() => lnmp.decodeBinary('not-a-base64')).toThrow();
  });

  test('encodeBinary leniently repairs quotes and succeeds', async () => {
    const messy = 'F1=1\nF2=Hello "world"';
    const bin = lnmp.encodeBinary(messy, { mode: 'lenient' });
    const text = lnmp.decodeBinary(Buffer.from(bin).toString('base64'));
    expect(text).toContain('F1=');
    expect(text).toMatch(/F2=/);
  });
});
