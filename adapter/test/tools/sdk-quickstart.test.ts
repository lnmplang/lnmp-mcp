import { lnmp } from '../../src/index';

describe('SDK Quickstart', () => {
  test('lnmp ready and parse usage', async () => {
    await lnmp.ready();
    const rec = lnmp.parse('F7=1\nF12=14532');
    expect(rec['7']).toBeTruthy();
    expect(rec['12']).toBe(14532);
  });
});
