const { spawn } = require('child_process');
const path = require('path');

const SERVER_PATH = path.join(__dirname, '../dist/index.js');

// Helper to run a sequence of MCP calls
async function runSimulation() {
    const server = spawn('node', [SERVER_PATH]);
    let idCounter = 1;

    const send = (method, params) => {
        return new Promise((resolve, reject) => {
            const id = idCounter++;
            const req = { jsonrpc: '2.0', id, method, params };

            const onData = (data) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const json = JSON.parse(line);
                        if (json.id === id) {
                            server.stdout.off('data', onData); // Stop listening for this ID
                            if (json.result) resolve(json.result);
                            else reject(new Error(json.error?.message || 'Unknown error'));
                        }
                    } catch (e) { }
                }
            };

            server.stdout.on('data', onData);
            server.stdin.write(JSON.stringify(req) + '\n');
        });
    };

    // Initialize
    await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sim', version: '1.0' } });

    console.log('🚁 STARTING DRONE SWARM SIMULATION...\n');

    // --- STEP 1: Raw Telemetry Ingest (Parse) ---
    console.log('1️⃣  Ingesting Raw Telemetry...');
    const rawData = "F1=Drone_Alpha\nF2=Battery_Low\nF3=15.5\nF4=Active";
    const parsedRes = await send('tools/call', { name: 'lnmp_parse', arguments: { text: rawData } });
    const droneData = JSON.parse(parsedRes.content[0].text).record;
    console.log(`   ✅ Parsed: ID=${droneData['1']}, Status=${droneData['2']}, Battery=${droneData['3']}%\n`);

    // --- STEP 2: Spatial Efficiency (Spatial Encode) ---
    console.log('2️⃣  Streaming 3D Coordinates (Spatial Encode)...');
    const pathPoints = [
        { x: 10.5, y: 20.1, z: 50.0 },
        { x: 12.0, y: 22.5, z: 52.1 },
        { x: 15.5, y: 25.0, z: 48.9 }
    ];
    const spatialRes = await send('tools/call', { name: 'lnmp_spatial_encode', arguments: { positions: pathPoints } });
    const encodedSpatial = JSON.parse(spatialRes.content[0].text).encoded;
    const originalSize = JSON.stringify(pathPoints).length;
    const encodedSize = encodedSpatial.length;
    console.log(`   ✅ Compressed 3D Path: ${originalSize} bytes -> ${encodedSize} bytes`);
    console.log(`   📉 Bandwidth Savings: ${Math.round((1 - encodedSize / originalSize) * 100)}% (Simulated)\n`);

    // --- STEP 3: Visual Sensor Optimization (Embedding Delta) ---
    console.log('3️⃣  Optimizing Visual Sensor Data (Embedding Delta)...');
    const prevFrame = [0.1, 0.2, 0.3, 0.4, 0.5];
    const currFrame = [0.1, 0.21, 0.3, 0.4, 0.52]; // Only slight changes
    const deltaRes = await send('tools/call', {
        name: 'lnmp_embedding_delta',
        arguments: { base: prevFrame, updated: currFrame }
    });
    const delta = JSON.parse(deltaRes.content[0].text).delta;
    console.log(`   ✅ Detected Changes: Only ${delta.changes.length} of ${prevFrame.length} dimensions changed.`);
    console.log(`   📉 Data Reduction: Sending partial update instead of full vector.\n`);

    // --- STEP 4: Intelligent Decision Making (Context & Network) ---
    console.log('4️⃣  Analyzing Context & Routing...');

    // Score Context
    const contextRes = await send('tools/call', {
        name: 'lnmp_context_score',
        arguments: { envelope: { record: droneData, metadata: { timestamp: Date.now() } } }
    });
    const scores = JSON.parse(contextRes.content[0].text).scores;
    console.log(`   📊 Context Score: Importance=${scores.importance}, Freshness=${scores.freshness}`);

    // Decide Route
    const routeRes = await send('tools/call', {
        name: 'lnmp_network_decide',
        arguments: { message: { priority: scores.importance * 100, content: "Low Battery Alert" } }
    });
    const decision = JSON.parse(routeRes.content[0].text).decision;
    console.log(`   🤖 AI Router Decision: "${decision}" (Based on high importance)\n`);

    // --- STEP 5: Secure Packaging (Envelope) ---
    console.log('5️⃣  Final Packaging (Envelope Wrap)...');
    const finalRes = await send('tools/call', {
        name: 'lnmp_envelope_wrap',
        arguments: {
            record: droneData,
            metadata: {
                spatial_blob: encodedSpatial,
                routing: decision,
                ai_score: scores
            }
        }
    });
    const finalEnvelope = JSON.parse(finalRes.content[0].text).envelope;
    console.log(`   ✅ Final Envelope Ready for Transport.`);
    console.log(`   📦 Contains: Telemetry + Compressed Spatial + AI Metadata.\n`);

    console.log('✨ SIMULATION COMPLETE: LNMP demonstrated Intelligence, Efficiency, and Interoperability.');
    server.kill();
}

runSimulation().catch(console.error);
