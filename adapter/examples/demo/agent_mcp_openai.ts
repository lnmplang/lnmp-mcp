import { startHttpServer } from "../../src/http_server";

// Try to load .env if available (the script below will source .env) or use dotenv when installed
try {
  // CommonJS require is allowed here in node builds
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require('dotenv');
  dotenv.config();
} catch (e) {
  // If dotenv is not installed, fall back to whatever env vars are loaded
}

async function post(base: string, path: string, body: any) {
  const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Request failed: ${res.status} - ${await res.text()}`);
  return res.json();
}

async function openaiQuery(system: string, user: string) {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!key) return null;
  const url = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const v = process.env.VERBOSE === 'true';
  if (v) console.log(`Using OpenAI model: ${model}`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 512, temperature: 0.3 }),
    });
    if (!res.ok) {
      console.warn('OpenAI request failed:', await res.text());
      return null;
    }
    const data = await res.json();
    return data.choices[0].message.content;
  } catch (err) {
    console.warn('OpenAI call error:', String(err));
    return null;
  }
}

function extractJSON(msgContent: string): any {
  // Try to locate the first and last curly braces to extract the JSON
  const idxStart = msgContent.indexOf('{');
  const idxEnd = msgContent.lastIndexOf('}');
  if (idxStart === -1 || idxEnd === -1) return null;
  const jsonStr = msgContent.slice(idxStart, idxEnd + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    // fallback: return null if not parseable
    return null;
  }
}

async function run() {
  const { server, port, stop } = await startHttpServer(0);
  const base = `http://localhost:${port}`;
  console.log(`Production agent demo running, HTTP server at ${base}`);
  const lnmpText = "F7=1\nF12=14532";
  const system = [
    'You are an AI agent that can call the following tools: parse, schema, explain, encbin, decbin.',
    'IMPORTANT: The following pipeline is MANDATORY and must be followed in order unless a step is already satisfied in the context:',
    'schema -> parse -> explain -> encbin -> decbin -> done',
    'Rules:',
    ' - Only respond with valid JSON (no additional explanation) and exactly one top-level object like { "action": "parse", "args": {} }.',
    ' - Allowed actions: "schema", "parse", "explain", "encbin", "decbin", "done".',
    ' - When using "schema" use args: { "mode": "full" }.',
    ' - When using "parse" use args: { "text": "..." }.',
    ' - When using "explain" use args: { "text": "..." }.',
    ' - When using "encbin" use args: { "text": "..." }.',
    ' - When using "decbin" use args: { "binary": "<base64>" }.',
    ' - You must return { "action": "done", "result": { ... } } when the agent has assembled a final structured output describing the record in terms of named fields using schema info.',
    ' - Do not repeat the same action indefinitely; if you need more fields, use "schema" to learn field names or use "explain" to obtain debug text.',
    ' - If you select "decbin", the args must contain a property called "binary" containing the base64-encoded binary string. If you use "base64" as key, it will be accepted but normalized to "binary".' ,
    'Follow these examples strictly (few-shot):',
    'Example 1 (single parse):',
    'User: "Here is LNMP text: F7=1\\nF12=14532"',
    'Assistant: { "action": "parse", "args": { "text": "F7=1\\nF12=14532" } }',
    'Example 2 (multi-turn: schema -> parse -> explain -> encbin -> decbin -> done):',
    'User: "Analyze Lnmp text: F7=1\\nF12=14532"',
    'Assistant (turn 1): { "action": "schema", "args": { "mode": "full" } }',
    'Assistant (turn 2): { "action": "parse", "args": { "text": "F7=1\\nF12=14532" } }',
    'Assistant (turn 3): { "action": "explain", "args": { "text": "F7=1\\nF12=14532" } }',
    'Assistant (turn 4): { "action": "encbin", "args": { "text": "F7=1\\nF12=14532" } }',
    'Assistant (turn 5): { "action": "decbin", "args": { "binary": "<base64>" } }',
    'Assistant (turn 6): { "action": "done", "result": { "is_active": true, "user_id": 14532 } }'
  ].join('\n');
  let context: any = { text: lnmpText, messages: [] };
  let iteration = 0;
  const maxCorrections = 3;
  while (iteration < 10) {
    iteration++;
    const userPrompt = `Context: ${JSON.stringify(context)}\nDecide next tool call in the mandatory pipeline (schema->parse->explain->encbin->decbin->done). Return a single JSON object { action, args }`;
    const response = await openaiQuery(system, userPrompt);
    console.log('[LLM] Response:', response);
    let parsed: any = extractJSON(response || '');
    if (!parsed) {
      // Try direct JSON parsing if the response might already be JSON
      try { parsed = response ? JSON.parse(response) : null; } catch (err) { /* fallthrough */ }
    }
    // Determine next required pipeline action
    function nextRequiredAction(ctx: any) {
      if (!ctx.schema) return 'schema';
      if (!ctx.record) return 'parse';
      if (!ctx.explain) return 'explain';
      if (!ctx.binary) return 'encbin';
      if (!ctx.decoded) return 'decbin';
      return 'done';
    }
    const required = nextRequiredAction(context);
    if (!parsed || !parsed.action) {
      parsed = { action: required, args: {} };
    }
    if (!parsed) {
      console.warn('Failed to extract JSON action from LLM response; content:', response);
      break;
    }
    if (!parsed || !parsed.action) break;
    if (parsed.action !== required) {
      // If LLM returned a different step, ask it to produce the required step instead.
      console.warn(`[Agent] LLM selected '${parsed.action}', but next required action is '${required}'. Asking for '${required}'`);
      // Ask corrective suggestion to LLM
      const correctionPrompt = `You selected action ${parsed.action} but the next required action (per mandatory pipeline) is ${required}. Please output a single JSON action: { \"action\": \"${required}\", \"args\": ... }`;
      let correctionResponse: any = null;
      let correction: any = null;
      let corrAttempts = 0;
      while (corrAttempts < maxCorrections && (!correction || !correction.action || correction.action !== required)) {
        corrAttempts++;
        correctionResponse = await openaiQuery(system, correctionPrompt);
        console.log('[LLM correction] Response:', correctionResponse);
        correction = extractJSON(correctionResponse || '') || (() => { try { return correctionResponse ? JSON.parse(correctionResponse) : null; } catch { return null; } })();
      }
      if (!correction || !correction.action) {
        console.warn('[Agent] Could not recover a valid correction from LLM. Breaking.');
        break;
      }
      parsed = correction;
    }
    if (parsed.action === 'done') { console.log('Agent done with result:', parsed.result); break; }
    if (parsed.action === 'parse') {
      const r = await post(base, '/parse', { text: lnmpText });
      context.record = r.record;
      console.log('[Agent] parse result:', r);
    } else if (parsed.action === 'schema') {
      const s = await post(base, '/schema', { mode: 'full' });
      context.schema = s;
      console.log('[Agent] schema:', s);
    } else if (parsed.action === 'explain') {
      const e = await post(base, '/explain', { text: lnmpText });
      context.explain = e;
      console.log('[Agent] explain:', e);
    } else if (parsed.action === 'encbin') {
      try {
        const enc = await post(base, '/encbin', { text: lnmpText });
        context.binary = enc.binary;
        console.log('[Agent] encbin:', enc);
      } catch (e) {
        console.warn('encbin failed:', String(e));
      }
    } else if (parsed.action === 'decbin') {
      if (context.binary) {
        // Accept either parsed.args.binary or parsed.args.base64 as alias
        let binArg = (parsed.args && (parsed.args.binary || parsed.args.base64)) || context.binary;
        if (!binArg && context.binary) binArg = context.binary;
        const dec = await post(base, '/decbin', { binary: binArg });
        context.decoded = dec;
        console.log('[Agent] decbin:', dec);
      } else {
        console.log('No binary in context to decode');
      }
    } else if (parsed.action === 'done') {
      // When done, require a result object and print conclusion
      console.log('[Agent] Done result:', parsed.result || null);
      break;
    }
  }
  await stop();
  if (server) server.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
