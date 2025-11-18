// Simple script to start the MCP adapter server and call tools directly
const { start } = require('../dist/index.js');
const parseTool = require('../dist/tools/parse.js').parseTool;
const encodeTool = require('../dist/tools/encode.js').encodeTool;
const encodeBinaryTool = require('../dist/tools/encodeBinary.js').encodeBinaryTool;
const decodeBinaryTool = require('../dist/tools/decodeBinary.js').decodeBinaryTool;
const schemaDescribeTool = require('../dist/tools/schemaDescribe.js').schemaDescribeTool;
const debugExplainTool = require('../dist/tools/debugExplain.js').debugExplainTool;

(async () => {
  try {
    const s = await start();
    console.log('Server started (in-memory stub).');

    // Test data
    const text = 'F7=1 F12=14532';

    console.log('\n--- parseTool ---');
    const parsed = await parseTool.handler({ text });
    console.log('parsed:', parsed);

    console.log('\n--- encodeTool ---');
    const record = parsed.record;
    const encoded = await encodeTool.handler({ record });
    console.log('encoded:', encoded);

    console.log('\n--- encodeBinaryTool -> decodeBinaryTool roundtrip ---');
    const encBin = await encodeBinaryTool.handler({ text });
    console.log('encoded binary (base64):', encBin.binary);
    const decBin = await decodeBinaryTool.handler({ binary: encBin.binary });
    console.log('decoded binary text:', decBin.text);

    console.log('\n--- schemaDescribeTool ---');
    const schema = await schemaDescribeTool.handler({ mode: 'full' });
    console.log('schema:', JSON.stringify(schema, null, 2));

    console.log('\n--- debugExplainTool ---');
    const explanation = await debugExplainTool.handler({ text });
    console.log('explanation:', explanation.explanation);

    // Test strict: do not fallback, expect parse error
    console.log('\n--- parse strict mode test: expect thrown error ---');
    const { lnmp } = require('../dist/index.js');
    // Disable fallback and attempt invalid parse
    lnmp.setParseFallback(false);
    try {
      await parseTool.handler({ text: 'notlnmp' });
      console.error('ERROR: parseTool did not throw as expected');
    } catch (e) {
      console.log('Expected parse error thrown:', e.message, 'code=', e.code);
    }
    lnmp.setParseFallback(true);

    // Stop server
    if (s && typeof s.stop === 'function') {
      await s.stop();
      console.log('Server stopped.');
    }
  } catch (err) {
    console.error('Error running test script:', err);
    process.exit(1);
  }
})();