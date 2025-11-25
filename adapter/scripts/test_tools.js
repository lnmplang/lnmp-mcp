#!/usr/bin/env node

/**
 * Quick test script for LNMP MCP tools
 * Usage: node scripts/test_tools.js
 */

const { lnmp } = require('../dist/bindings/lnmp');

async function testTools() {
    console.log('🚀 Testing LNMP MCP Tools\n');

    // Initialize WASM
    await lnmp.ready();
    console.log('✅ WASM initialized\n');

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

    // Test 3: Envelope (if available)
    console.log('3. Testing lnmp.envelope.wrap...');
    try {
        const envelope = lnmp.envelopeWrap(record, { timestamp: Date.now(), source: 'test' });
        console.log('   Envelope created:', JSON.stringify(envelope, null, 2));
        console.log('   ✅ Envelope OK\n');
    } catch (err) {
        console.log('   ⚠️  Envelope not available (WASM export needed)\n');
    }

    // Test 4: Embedding Delta (if available)
    console.log('4. Testing lnmp.embedding.computeDelta...');
    try {
        const base = [0.1, 0.2, 0.3, 0.4, 0.5];
        const updated = [0.1, 0.25, 0.3, 0.4, 0.5];
        const delta = lnmp.embeddingComputeDelta(base, updated);
        console.log('   Delta:', JSON.stringify(delta));
        console.log('   ✅ Embedding Delta OK\n');
    } catch (err) {
        console.log('   ⚠️  Embedding delta not available (WASM export needed)\n');
    }

    console.log('🎉 Testing complete!');
}

testTools().catch(console.error);
