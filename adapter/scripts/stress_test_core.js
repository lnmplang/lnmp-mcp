const { spawn } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '../dist/index.js');

function runRequest(request) {
    return new Promise((resolve, reject) => {
        const server = spawn('node', [SERVER_PATH]);
        let output = '';
        let error = '';
        let resolved = false;

        server.stdout.on('data', (data) => {
            output += data.toString();
            const lines = output.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const json = JSON.parse(line);
                    if (json.id === request.id) {
                        resolved = true;
                        if (json.result) {
                            resolve(json.result);
                        } else {
                            reject(new Error(json.error ? json.error.message : 'Unknown error'));
                        }
                        server.kill();
                    }
                } catch (e) { }
            }
        });

        server.stderr.on('data', (data) => error += data.toString());

        server.on('close', () => {
            if (!resolved) reject(new Error(`Server closed. Stderr: ${error}`));
        });

        // Initialize
        const initMsg = {
            jsonrpc: '2.0', id: 0, method: 'initialize',
            params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'stress-test', version: '1.0' } }
        };
        server.stdin.write(JSON.stringify(initMsg) + '\n');

        // Send Request
        setTimeout(() => {
            server.stdin.write(JSON.stringify(request) + '\n');
        }, 100);
    });
}

async function main() {
    console.log('🧪 Starting Core & Field Stress Tests...\n');

    // 1. Large Dataset Test (1000 Fields)
    console.log('1️⃣  Testing Large Dataset (1000 Fields)...');
    let largeText = '';
    for (let i = 0; i < 1000; i++) {
        largeText += `F${i}=Value_${i}\n`;
    }
    try {
        const res = await runRequest({
            jsonrpc: '2.0', id: 1, method: 'tools/call',
            params: { name: 'lnmp_parse', arguments: { text: largeText } }
        });
        const content = JSON.parse(res.content[0].text);
        const keys = Object.keys(content.record);
        console.log(`   ✅ Parsed ${keys.length} fields successfully.`);
        console.log(`   Sample: F0=${content.record['0']}, F999=${content.record['999']}\n`);
    } catch (err) {
        console.log(`   ❌ Failed: ${err.message}\n`);
    }

    // 2. Deeply Nested Structure (Envelope)
    console.log('2️⃣  Testing Deeply Nested Envelope...');
    const deepMetadata = {
        level1: {
            level2: {
                level3: {
                    level4: {
                        level5: "DeepValue",
                        array: [1, 2, { inner: "struct" }]
                    }
                }
            }
        }
    };
    try {
        const res = await runRequest({
            jsonrpc: '2.0', id: 2, method: 'tools/call',
            params: {
                name: 'lnmp_envelope_wrap',
                arguments: { record: { "1": "Data" }, metadata: deepMetadata }
            }
        });
        const content = JSON.parse(res.content[0].text);
        const val = content.envelope.metadata.level1.level2.level3.level4.level5;
        console.log(`   ✅ Preserved deep structure.`);
        console.log(`   Retrieved Value at Level 5: "${val}"`);
        console.log(`   Processed By: ${content.envelope.metadata.processed_by}\n`);
    } catch (err) {
        console.log(`   ❌ Failed: ${err.message}\n`);
    }

    // 3. Mixed Field Types
    console.log('3️⃣  Testing Mixed Field Types...');
    const mixedText = `F1=12345
F2=123.456
F3=1
F4=0
F5=TrueString
F6=007`; // 007 might be parsed as number 7
    try {
        const res = await runRequest({
            jsonrpc: '2.0', id: 3, method: 'tools/call',
            params: { name: 'lnmp_parse', arguments: { text: mixedText } }
        });
        const rec = JSON.parse(res.content[0].text).record;
        console.log(`   ✅ Parsed mixed types:`);
        console.log(`   F1 (Int): ${rec['1']} (${typeof rec['1']})`);
        console.log(`   F2 (Float): ${rec['2']} (${typeof rec['2']})`);
        console.log(`   F3 (Bool True): ${rec['3']} (${typeof rec['3']})`);
        console.log(`   F4 (Bool False): ${rec['4']} (${typeof rec['4']})`);
        console.log(`   F5 (String): ${rec['5']} (${typeof rec['5']})`);
        console.log(`   F6 (Leading Zero): ${rec['6']} (${typeof rec['6']})`); // Interesting case
    } catch (err) {
        console.log(`   ❌ Failed: ${err.message}\n`);
    }
}

main().catch(console.error);
