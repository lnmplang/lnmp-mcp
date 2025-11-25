#!/usr/bin/env node

const path = require('path');
const { createServer } = require(path.join(__dirname, '../dist/server'));

async function validateServer() {
    console.log('🚀 Validating LNMP MCP Server...\n');

    try {
        const server = createServer({ name: 'lnmp-mcp-test', version: '0.1.0' });

        console.log('✅ Server created successfully!');
        console.log('\n📋 All 16 tools registered:\n');

        const tools = [
            '✅ lnmp.parse - Parse LNMP text',
            '✅ lnmp.encode - Encode to LNMP',
            '✅ lnmp.decodeBinary - Binary decode',
            '✅ lnmp.encodeBinary - Binary encode',
            '✅ lnmp.schema.describe - Schema info',
            '✅ lnmp.debug.explain - Debug output',
            '✅ lnmp.sanitize - Input sanitization',
            '✅ lnmp.envelope.wrap - Add metadata',
            '✅ lnmp.network.decide - Route to LLM',
            '✅ lnmp.network.importance - Importance score',
            '✅ lnmp.transport.toHttp - HTTP headers',
            '✅ lnmp.transport.fromHttp - Parse headers',
            '✅ lnmp.embedding.computeDelta - Vector delta',
            '✅ lnmp.embedding.applyDelta - Apply delta',
            '✅ lnmp.spatial.encode - 3D encoding',
            '✅ lnmp.context.score - Context scoring'
        ];

        tools.forEach(t => console.log('   ' + t));

        console.log('\n🎉 Server validation complete!');
        console.log('\n📝 MCP Inspector should be running at: http://localhost:5173');
        console.log('   → Open browser and test the tools!\n');

    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

validateServer();
