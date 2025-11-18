import { lnmp } from "../../bindings/lnmp";

async function run() {
  await lnmp.initLnmpWasm({ path: __dirname + "/../../../wasm/lnmp_wasm_bg.wasm" }).catch(() => {});
  const text = "F7=1 F12=14532";

  const record = lnmp.parse(text);
  console.log("Record:", record);

  const analysis = { is_active: !!record["7"], user_id: record["12"] };
  console.log("Analysis:", analysis);

  const binary = lnmp.encodeBinary(text);
  console.log("Binary base64:", Buffer.from(binary).toString("base64"));

  const explanation = lnmp.debugExplain(text);
  console.log("Explain:\n", explanation);
}

run().catch(console.error);
