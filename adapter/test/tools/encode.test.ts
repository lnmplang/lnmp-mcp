import { lnmp } from '../../src/bindings/lnmp';

describe('lnmp.encode', () => {
  beforeAll(async () => {
    await lnmp.initLnmpWasm({ path: __dirname + '/../../src/wasm/lnmp_wasm_bg.wasm', force: true });
  });

  test('encodes a json record to text', async () => {
    const rec = { '7': true, '12': 14532 };
    const text = lnmp.encode(rec);
    expect(text).toContain('F7=1');
    expect(text).toContain('F12=14532');
  });
});
