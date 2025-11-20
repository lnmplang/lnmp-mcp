import { startHttpServer } from "../../src/http_server";

// Simple helper to call MCP endpoints
async function post(base: string, path: string, body: any) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Request failed: ${res.status} - ${await res.text()}`);
  return res.json();
}

// LLM: OpenAI or Mock
async function openaiQuery(system: string, user: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const url = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const v = process.env.VERBOSE === 'true';
  if (v) console.log(`Using OpenAI model: ${model}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 256, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status} - ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

function extractJSON(msgContent: string): any {
  const idxStart = msgContent.indexOf('{');
  const idxEnd = msgContent.lastIndexOf('}');
  if (idxStart === -1 || idxEnd === -1) return null;
  const jsonStr = msgContent.slice(idxStart, idxEnd + 1);
  try { return JSON.parse(jsonStr); } catch { return null; }
}

function extractLNMPF2(msgContent: string | null): string | null {
  if (!msgContent) return null;
  const lines = msgContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const l of lines) {
    const m = /^F2=(?:"([\s\S]*)"|([\s\S]*))$/.exec(l);
    if (m) return (m[1] || m[2] || '').trim();
  }
  return null;
}

function ensureF2Quoted(lnmpText: string) {
  // returns a LNMP string with F2 quoted and inner quotes escaped
  if (!lnmpText) return lnmpText;
  const lines = lnmpText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: string[] = [];
  let seenF2 = false;
  for (const l of lines) {
    const m = /^F2=(?:"([\s\S]*)"|([\s\S]*))$/.exec(l);
    if (m) {
      const rawVal = (m[1] || m[2] || '').replace(/\\"/g, '"'); // normalize any escaped quotes
      const v = rawVal.replace(/"/g, '\\"');
      out.push(`F2="${v}"`);
      seenF2 = true;
      continue;
    }
    // Keep other fields unchanged
    out.push(l);
  }
  if (!seenF2) {
    // If there's no F2, try detect first non-Fx value and append as F2
    // Typically we won't want to add, just return the same text
    return lnmpText;
  }
  return out.join('\n');
}

// Mock LLM: respond with a simple LNMP reply in text
function mockLLMResponse(text: string, turn: number) {
  // Basic echo style: message_type 2 (answer), content with turn id
  const content = `Reply to: ${text.replace(/\n/g, ' ')} (#${turn})`.replace(/"/g, '\\"');
  // return LNMP text: F1=2 F2="<content>"
  return `F1=2\nF2="${content}"`;
}

async function runPair(durationSec = 60, useOpenAI = false) {
  const { server, port, stop } = await startHttpServer(0);
  const base = `http://localhost:${port}`;
  console.log(`Pair load test running on ${base} for ${durationSec}s, useOpenAI=${useOpenAI}`);

  const start = Date.now();
  let round = 0;
  const metrics: any[] = [];
  const transcripts: any[] = [];

  // simple system prompt for OpenAI (prefer JSON output for easier parsing)
  const system = `You are a short LNMP responder. When asked to reply, return either a small JSON with {"action": "reply", "text": "..."} or a LNMP text reply with F1=2 and F2=<reply>. Prefer the JSON form and ONLY return the JSON object or LNMP text (no extra commentary).`.trim();

  const verbose = process.env.VERBOSE === 'true';
  const outputFile = process.env.OUTPUT_FILE;
  const llmThrottleMs = Number(process.env.LLM_THROTTLE_MS || '0');
  function writeFileSync(jsonPath: string, data: any) {
    try { require('fs').writeFileSync(jsonPath, JSON.stringify(data, null, 2)); } catch (err) { if (verbose) console.warn('Failed write file', String(err)); }
  }

  while ((Date.now() - start) < durationSec * 1000) {
    round++;
    try {
    // ensure we quote the LNMP F2 text so wasm text format doesn't choke
    const aText = `F1=1\nF2=Hello from A round ${round}`;
    const begin = process.hrtime.bigint();
    const t1Start = process.hrtime.bigint();
    // A encbin
    const encAStart = process.hrtime.bigint();
    if (verbose) console.log(`Round ${round} - encA aText:`, aText);
    if (verbose) console.log(`Round ${round} - POST /encbin aText`);
    const sanitizedA = ensureF2Quoted(aText);
    if (verbose && sanitizedA !== aText) console.warn(`Sanitized aText on round ${round}`);
    const encA = await post(base, '/encbin', { text: sanitizedA, mode: 'lenient' });
    const encAEnd = process.hrtime.bigint();
    // Send to B (simulate wire)
    const decBStart = process.hrtime.bigint();
    if (verbose) console.log(`Round ${round} - POST /decbin -> decB`);
    const decB = await post(base, '/decbin', { binary: encA.binary });
    const decBEnd = process.hrtime.bigint();
    // B parse
    const parseBStart = process.hrtime.bigint();
    if (verbose) console.log(`Round ${round} - POST /parse B`);
    const parseB = await post(base, '/parse', { text: decB.text });
    const parseBEnd = process.hrtime.bigint();

    // B LLM reasoning -> formulate response
    const llmStart = process.hrtime.bigint();
    let llmResp: string | null = null;
    let bResponseText: string;
    try {
      if (useOpenAI) {
        const userPrompt = `Read LNMP text:\n${decB.text}\nProduce a reply. Return a small JSON object {"action":"reply","text":"<reply>"} or LNMP text F1=2 F2=<reply>. Prefer JSON.`;
        llmResp = await openaiQuery(system, userPrompt);
        if (verbose) console.log(`OpenAI resp (round ${round}):`, llmResp);
        // extract JSON or LNMP; we'll parse JSON first, then try to extract an LNMP F2 value
        const json = llmResp ? extractJSON(llmResp) : null;
        if (json && (json.action === 'reply' || json.action === 'done')) {
          const resText = json.text || json.result?.text || `reply to ${decB.text}`;
          bResponseText = `F1=2\nF2="${(resText || '').replace(/\"/g, '\\\"')}"`;
        } else {
          // Try to extract LNMP F2 field
          const extracted = extractLNMPF2(llmResp);
          if (extracted) {
            bResponseText = `F1=2\nF2="${extracted.replace(/\"/g, '\\\"')}"`;
          } else {
            // fallback: take llmResp plain text
            const content = (llmResp || '').replace(/\n/g, ' ');
            bResponseText = `F1=2\nF2="${content.replace(/\"/g, '\\\"')}"`;
          }
        }
      } else {
        // mock LLM returns already escaped F2
        bResponseText = mockLLMResponse(decB.text, round);
      }
    } catch (e) {
      // in case LLM fails, fallback to simple echo reply
      console.warn(`LLM failed on round ${round}:`, String(e));
      bResponseText = `F1=2\nF2="Fallback reply to ${decB.text.replace(/\n/g, ' ')}"`;
    }
    if (useOpenAI && llmThrottleMs > 0) {
      if (verbose) console.log(`Throttling LLM by ${llmThrottleMs}ms on round ${round}`);
      await new Promise((res) => setTimeout(res, llmThrottleMs));
    }
    const llmEnd = process.hrtime.bigint();

    // B encbin
    const encBStart = process.hrtime.bigint();
    if (verbose) console.log(`Round ${round} - POST /encbin bResponseText`);
    const sanitizedB = ensureF2Quoted(bResponseText);
    if (verbose && sanitizedB !== bResponseText) console.warn(`Sanitized bResponseText on round ${round}`);
    const encB = await post(base, '/encbin', { text: sanitizedB, mode: 'lenient' });
    const encBEnd = process.hrtime.bigint();
    // deliver to A: decbin
    const decAStart = process.hrtime.bigint();
    if (verbose) console.log(`Round ${round} - POST /decbin -> decA`);
    const decA = await post(base, '/decbin', { binary: encB.binary });
    const decAEnd = process.hrtime.bigint();
    // parse at A
    const parseAStart = process.hrtime.bigint();
    if (verbose) console.log(`Round ${round} - POST /parse A`);
    const parseA = await post(base, '/parse', { text: decA.text });
        const parseAEnd = process.hrtime.bigint();

        // round-trip duration
        const end = process.hrtime.bigint();
        const rt = Number(end - begin) / 1e6; // ms

        const binaryBytesA = Buffer.from(encA.binary, 'base64').length;
    const m = {
      round,
      a_text: aText,
      b_text: bResponseText,
      a_text_len: aText.length,
      binary_size_a: binaryBytesA,
      compression_ratio_a: aText.length / Math.max(1, binaryBytesA),
      encA_ms: Number(encAEnd - encAStart) / 1e6,
      decB_ms: Number(decBEnd - decBStart) / 1e6,
      parseB_ms: Number(parseBEnd - parseBStart) / 1e6,
      llm_ms: Number(llmEnd - llmStart) / 1e6,
      encB_ms: Number(encBEnd - encBStart) / 1e6,
      decA_ms: Number(decAEnd - decAStart) / 1e6,
      parseA_ms: Number(parseAEnd - parseAStart) / 1e6,
      round_trip_ms: rt,
    };
    metrics.push(m);
    // keep lightweight transcript (cap to first 200 rounds to avoid huge output)
    if (transcripts.length < 200) {
      transcripts.push({
        round,
        a_text: sanitizedA,
        b_text: bResponseText,
        llm_response: llmResp,
        decB_text: decB.text,
        decA_text: decA.text,
      });
    }
    if (verbose) console.log(`Round ${round}: A->B bytes=${m.binary_size_a} enc=${m.encA_ms.toFixed(2)}ms dec=${m.decB_ms.toFixed(2)}ms parse=${m.parseB_ms.toFixed(2)}ms llm=${m.llm_ms.toFixed(2)}ms enc=${m.encB_ms.toFixed(2)}ms dec=${m.decA_ms.toFixed(2)}ms parse=${m.parseA_ms.toFixed(2)}ms total=${m.round_trip_ms.toFixed(2)}ms`);
    } catch (roundErr) {
      console.warn(`Round ${round} error:`, String(roundErr));
      // continue to next round
      continue;
    }
  }

  await stop();
  if (server) server.close();

  // Summaries
  const totalMsgs = metrics.length;
  const ms = metrics.map(m => m.round_trip_ms).sort((a,b) => a-b);
  const percentile = (p: number) => { const idx = Math.floor((p/100)*ms.length); return ms[Math.min(idx, ms.length-1)]; };
  const msgsPerSec = totalMsgs / durationSec;
  const avg = (prop: string) => metrics.reduce((s, v) => s + v[prop], 0) / totalMsgs;
  console.log('--- Summary ---');
  console.log(`Total rounds: ${totalMsgs}`);
  console.log(`Avg encA_ms: ${avg('encA_ms').toFixed(2)}ms`);
  console.log(`Avg decB_ms: ${avg('decB_ms').toFixed(2)}ms`);
  console.log(`Avg parseB_ms: ${avg('parseB_ms').toFixed(2)}ms`);
  console.log(`Avg llm_ms: ${avg('llm_ms').toFixed(2)}ms`);
  console.log(`Avg round_trip_ms: ${avg('round_trip_ms').toFixed(2)}ms`);
  console.log(`Messages/sec: ${msgsPerSec.toFixed(2)}`);
  console.log(`Round P50/P90/P99: ${percentile(50).toFixed(2)} / ${percentile(90).toFixed(2)} / ${percentile(99).toFixed(2)} ms`);
  if (outputFile) {
    try {
      writeFileSync(outputFile, {
        metrics,
        summary: { totalMsgs, msgsPerSec, avgRoundTripMs: avg('round_trip_ms') },
        transcripts,
      });
      console.log(`Wrote metrics to ${outputFile}`);
    } catch (err) {
      console.warn('Failed to write metrics:', String(err));
    }
  }
}

// CLI runner
const durationSec = Number(process.env.PAIR_DURATION || '60');
const useOpenAI = process.env.USE_OPENAI === 'true';
      try {
runPair(durationSec, useOpenAI).catch((e) => { console.error(e); process.exit(1); });
      } catch (err) {
        console.warn('Round error:', String(err));
      }
