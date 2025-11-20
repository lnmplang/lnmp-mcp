import { lnmp } from "../src/bindings/lnmp";

async function run() {
  await lnmp.initLnmpWasm({ path: __dirname + "/../wasm/lnmp_wasm_bg.wasm" }).catch(() => {});
  const text = "F7=1 F12=14532";

  // Simulate LLM calling parse tool
  const record = lnmp.parse(text);
  console.log("Record:", record);

  // LLM might transform or analyze the record (just a mock analysis)
  const analysis = { is_active: !!record["7"], user_id: record["12"] };
  console.log("Analysis:", analysis);

  // LLM requests a binary encoding
  const binary = lnmp.encodeBinary(text);
  console.log("Binary base64:", Buffer.from(binary).toString("base64"));

  // LLM requests debug explanation
  const explanation = lnmp.debugExplain(text);
  console.log("Explain:\n", explanation);
}

run().catch(console.error);
