import { lnmp } from '../../src/bindings/lnmp';
import { parseTool } from '../../src/tools/parse';

describe('lnmp.parse', () => {
  beforeAll(async () => {
    await lnmp.initLnmpWasm({ path: __dirname + '/../../src/wasm/lnmp_wasm_bg.wasm', force: true });
  });

  test('parses a simple record and returns JSON', async () => {
    const rec = lnmp.parse('F7=1\nF12=14532');
    expect(rec).toBeDefined();
    expect(rec['7']).toBeTruthy();
    expect(rec['12']).toBe(14532);
  });

  test('roundtrip parse -> encode -> parse', async () => {
    const originalText = 'F7=1\nF12=14532';
    const rec = lnmp.parse(originalText);
    const text = lnmp.encode(rec);
    const rec2 = lnmp.parse(text);
    expect(rec2['7']).toBeTruthy();
    expect(rec2['12']).toBe(14532);
  });

  test('invalid input returns empty object instead of crash', async () => {
    const rec = lnmp.parse('notlnmp');
    expect(rec).toBeDefined();
  });

  test('parse in strict mode throws error for invalid input', async () => {
    lnmp.setParseFallback(false);
    expect(() => lnmp.parse('notlnmp')).toThrow();
    lnmp.setParseFallback(true);
  });
  
  test('parseTool.handler respects per-request strict flag', async () => {
    // Non-strict fallback behavior (returns empty object) should work
    let res = await parseTool.handler({ text: 'notlnmp' });
    expect(res.record).toBeDefined();
    // strict true should throw
    await expect(async () => {
      await parseTool.handler({ text: 'notlnmp', strict: true });
    }).rejects.toThrow();
  });

  test('lenient mode sanitizes and parses', async () => {
    const messy = 'F1=1\nF2=Hello "world"';
    const result = lnmp.parse(messy, { mode: 'lenient' });
    expect(result).toBeDefined();
    expect(result['1'] === 1 || result['1'] === true).toBeTruthy();
  });
});
