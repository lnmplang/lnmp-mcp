import { lnmp } from '../../src/bindings/lnmp';

describe('lnmp.schema', () => {
  beforeAll(async () => {
    await lnmp.initLnmpWasm({ path: __dirname + '/../../src/wasm/lnmp_wasm_bg.wasm', force: true });
  });

  test('schemaDescribe returns expected field types', async () => {
    const s = lnmp.schemaDescribe('full');
    console.log('schema returned:', s);
    expect(s).toHaveProperty('fields');
    expect(s.fields).toHaveProperty('7');
    expect(s.fields['7'].type).toBe('boolean');
  });
});
