const { spawn } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '../dist/index.js');

function runTest(name, request) {
    return new Promise((resolve, reject) => {
        const server = spawn('node', [SERVER_PATH]);
        let output = '';
        let error = '';
        let passed = false;

        server.stdout.on('data', (data) => {
            output += data.toString();
            const lines = output.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);
                    if (json.id === request.id) {
                        if (json.result) {
                            passed = true;
                            resolve(json.result);
                            server.kill();
                        } else if (json.error) {
                            reject(new Error(json.error.message));
                            server.kill();
                        }
                    }
                } catch (e) {
                    // Ignore non-JSON lines
                }
            }
        });

        server.stderr.on('data', (data) => {
            error += data.toString();
        });

        server.on('close', (code) => {
            if (!passed) reject(new Error(`Server closed without response. Stderr: ${error}`));
        });

        // Send initialize first
        const initMsg = {
            jsonrpc: '2.0',
            id: 0,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'test', version: '1.0' }
            }
        };
        server.stdin.write(JSON.stringify(initMsg) + '\n');

        // Wait a bit then send request
        setTimeout(() => {
            server.stdin.write(JSON.stringify(request) + '\n');
        }, 100);
    });
}

async function main() {
    console.log('🚀 Starting LNMP MCP Tool Verification...\n');

    const tests = [
        {
            name: 'lnmp_parse',
            req: {
                jsonrpc: '2.0', id: 1, method: 'tools/call',
                params: { name: 'lnmp_parse', arguments: { text: 'F12=42\nF7=1' } }
            },
            check: (res) => {
                const content = JSON.parse(res.content[0].text);
                return content.record['12'] === 42 && content.record['7'] === true;
            }
        },
        {
            name: 'lnmp_encode',
            req: {
                jsonrpc: '2.0', id: 2, method: 'tools/call',
                params: { name: 'lnmp_encode', arguments: { record: { "12": 42, "7": true } } }
            },
            check: (res) => {
                const text = res.content[0].text;
                return text.includes('F12=42') && text.includes('F7=1');
            }
        },
        {
            name: 'lnmp_envelope_wrap',
            req: {
                jsonrpc: '2.0', id: 3, method: 'tools/call',
                params: {
                    name: 'lnmp_envelope_wrap',
                    arguments: { record: { "1": 1 }, metadata: { "source": "test" } }
                }
            },
            check: (res) => {
                const content = JSON.parse(res.content[0].text);
                return content.envelope.metadata.source === 'test';
            }
        },
        {
            name: 'lnmp_network_decide',
            req: {
                jsonrpc: '2.0', id: 4, method: 'tools/call',
                params: {
                    name: 'lnmp_network_decide',
                    arguments: { message: { priority: 150 } }
                }
            },
            check: (res) => {
                const content = JSON.parse(res.content[0].text);
                return content.decision === 'SendToLLM';
            }
        },
        {
            name: 'lnmp_embedding_delta',
            req: {
                jsonrpc: '2.0', id: 5, method: 'tools/call',
                params: {
                    name: 'lnmp_embedding_delta',
                    arguments: { base: [1.0, 2.0], updated: [1.1, 2.0] }
                }
            },
            check: (res) => {
                const content = JSON.parse(res.content[0].text);
                // Delta for index 0 should be 0.1
                return content.delta.changes.some(c => c.index === 0 && Math.abs(c.delta - 0.1) < 0.001);
            }
        }
    ];

    let passedCount = 0;

    for (const test of tests) {
        process.stdout.write(`Testing ${test.name.padEnd(25)} `);
        try {
            const result = await runTest(test.name, test.req);
            if (test.check(result)) {
                console.log('✅ PASS');
                passedCount++;
            } else {
                console.log('❌ FAIL (Check failed)');
                console.log('Result:', JSON.stringify(result, null, 2));
            }
        } catch (err) {
            console.log('❌ FAIL (Error)');
            console.error(err.message);
        }
    }

    console.log(`\nSummary: ${passedCount}/${tests.length} tests passed.`);
}

main().catch(console.error);
