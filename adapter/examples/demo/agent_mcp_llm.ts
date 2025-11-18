import { startHttpServer } from "../../src/http_server";

async function llmThinkStep(prompt: string, context: any) {
  // This is a *very* small mock LLM: it uses simple rule-based reasoning
  // to decide the next MCP call. This showcases a LLM-in-the-loop loop.
  // If there's a record in context, ask to explain and encode it
  if (context && context.record) return { action: "explain_and_encbin" };
  if (prompt.includes("parse")) return { action: "parse" };
  if (prompt.includes("explain")) return { action: "explain" };
  if (prompt.includes("encbin")) return { action: "encbin" };
  if (prompt.includes("schema")) return { action: "schema" };
  return { action: "parse" };
}

async function llmQueryOpenAI(prompt: string) {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY;
  if (!key) return null;
  const url = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
  const body = {
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: "You are an agent that decides which tool to call (parse, schema, explain, encbin, decbin) and returns a JSON response with { action: \"parse\"|\"schema\"|\"explain\"|\"encbin\"|\"decbin\", args: {} }" }, { role: "user", content: prompt }],
    max_tokens: 200,
    temperature: 0,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn("OpenAI LLM request failed:", await res.text());
    return null;
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  try {
    return JSON.parse(content);
  } catch (e) {
    return content;
  }
}

async function callEndpoint(base: string, path: string, body: any) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Request failed: ${res.status} - ${txt}`);
  }
  return res.json();
}

async function run() {
  // Start a local MCP HTTP server exposing LNMP tools
  const { server, port, stop } = await startHttpServer(0);
  const base = `http://localhost:${port}`;
  console.log(`Demo MCP server running on ${base}`);

  const text = "F7=1\nF12=14532";
  let ctx: any = {};

  // Mock LLM: plan -> parse -> explanation & binary -> decode & final
  // Try a real LLM if configured
  let plan1: any = await llmQueryOpenAI("Decide: parse this text or call schema to learn field ids. Return JSON { action, args }.");
  if (!plan1) plan1 = await llmThinkStep("parse this LNMP", ctx);
  if (plan1.action === "parse") {
    const r = await callEndpoint(base, "/parse", { text });
    console.log("[LLM] Parse result:", r);
    ctx.record = r.record;
  }

  // Demonstrate schema discovery to learn what fields mean
  try {
    const schema = await callEndpoint(base, "/schema", { mode: "full" });
    console.log("[LLM] Schema info:", schema);
    ctx.schema = schema;
    // map FID to name/type
    const mapping: Record<string, any> = {};
    if (schema && schema.fields) {
      for (const [fid, info] of Object.entries(schema.fields)) {
        if (typeof info === 'object' && info !== null) {
          const infoObj: any = info as any;
          mapping[fid] = { name: infoObj['name'] || null, type: infoObj['type'] || null };
        } else {
          mapping[fid] = { name: null, type: info };
        }
      }
    }
    ctx.fid_mapping = mapping;
    console.log("[LLM] Field mapping:", mapping);
  } catch (err) {
    console.warn("[LLM] Could not fetch schema:", String(err));
  }

  let plan2: any = await llmQueryOpenAI("If record present, explain and encbin; otherwise maybe ask for schema. Return { action, args }.");
  if (!plan2) plan2 = await llmThinkStep("explain and encbin if record present", ctx);
  if (plan2.action === "explain_and_encbin") {
    try {
      const explainRes = await callEndpoint(base, "/explain", { text });
      console.log("[LLM] Explain result:\n", explainRes);
    } catch (err) {
      console.error("[LLM] Explain failed:", String(err));
    }

    try {
      const encRes = await callEndpoint(base, "/encbin", { text });
      console.log("[LLM] Binary (base64):", encRes.binary);

      const decRes = await callEndpoint(base, "/decbin", { binary: encRes.binary });
      console.log("[LLM] Decode result:", decRes);

      // LLM extracts the decoded text and re-parses it to be sure the binary encodes the same record
      if (decRes && decRes.text) {
        const rec = await callEndpoint(base, "/parse", { text: decRes.text });
        console.log("[LLM] Parse after decode result:", rec);
        ctx.record_decoded = rec.record;
      }
    } catch (err) {
      console.error("[LLM] encbin/decbin failed:", String(err));
    }
  } else if (plan2.action === "explain") {
    try {
      const explainRes = await callEndpoint(base, "/explain", { text });
      console.log("[LLM] Explain result:\n", explainRes);
    } catch (err) {
      console.error("[LLM] Explain failed:", String(err));
    }
  } else if (plan2.action === "encbin") {
    try {
      const encRes = await callEndpoint(base, "/encbin", { text });
      console.log("[LLM] Binary (base64):", encRes.binary);
    } catch (err) {
      console.error("[LLM] encbin failed:", String(err));
    }
  }

  // Final reasoning from LLM: conclude fields of interest
  // Convert parsed record to a more human-friendly JSON using schema field names
  const final: any = { raw_text: text };
  if (ctx.record && ctx.fid_mapping) {
    for (const [fid, val] of Object.entries(ctx.record)) {
      const name = ctx.fid_mapping?.[fid]?.name || `F${fid}`;
      final[name] = val;
    }
  } else {
    // default fallback
    final.user_id = ctx.record?.["12"] || null;
    final.is_active = !!ctx.record?.["7"];
  }
  console.log("[LLM] Final reasoning: ", final);

  // Stop server
  await stop();
  server.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
