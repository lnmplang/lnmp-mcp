import { lnmp } from '../../src/bindings/lnmp';
import { sanitizeTool } from '../../src/tools/sanitize';

describe('lnmp.sanitize', () => {
  beforeAll(async () => {
    await lnmp.initLnmpWasm({ path: __dirname + '/../../src/wasm/lnmp_wasm_bg.wasm', force: true }).catch(() => {});
  });

  test('sanitizes unquoted strings by default', async () => {
    const input = 'F1=1\nF2=Hello "world"';
    const res = lnmp.sanitize(input);
    expect(res.changed).toBeTruthy();
    expect(res.text).toMatch(/F2=.*\\\"world\\\"/);
  });

  test('sanitize tool returns structured output', async () => {
    const res = await sanitizeTool.handler({ text: 'F1=1;F2=hi', options: { level: 'minimal' } });
    expect(res.text).toBeDefined();
    expect(typeof res.changed).toBe('boolean');
  });
});
