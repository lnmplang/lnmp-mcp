#!/usr/bin/env node

/**
 * Test LNMP MCP Tools - Proper WASM initialization
 * Usage: node scripts/test_demo.js
 */

const path = require('path');

async function testTools() {
    console.log('🚀 Testing LNMP MCP Tools\n');

    // Import after defining path
    const { lnmp } = require('../dist/bindings/lnmp');

    // Initialize WASM with explicit path
    const wasmPath = path.join(__dirname, '../src/wasm/lnmp_wasm_bg.wasm');
    await lnmp.initLnmpWasm({ path: wasmPath });
    console.log('✅ WASM initialized from:', wasmPath, '\n');

    // Test 1: Parse
    console.log('1. Testing lnmp.parse...');
    const record = lnmp.parse('F12=42\nF7=1');
    console.log('   Result:', JSON.stringify(record));
    console.log('   ✅ Parse OK\n');

    // Test 2: Encode
    console.log('2. Testing lnmp.encode...');
    const text = lnmp.encode(record);
    console.log('   Result:', text);
    console.log('   ✅ Encode OK\n');

    // Test 3: Binary round-trip
    console.log('3. Testing binary encode/decode...');
    const binary = lnmp.encodeBinary(text);
    const decoded = lnmp.decodeBinary(binary);
    console.log('   Binary length:', binary.length, 'bytes');
    console.log('   Decoded:', decoded);
    console.log('   ✅ Binary OK\n');

    console.log('🎉 Core tools working!');
    console.log('\n📝 To test new tools (envelope, network, etc):');
    console.log('   npm start');
    console.log('   Then use MCP Inspector or Claude Desktop\n');
}

testTools().catch(err => {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
});
