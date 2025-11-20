import { lnmp } from "../bindings/lnmp";

async function run() {
  try {
    await lnmp.initLnmpWasm({ path: __dirname + "/../../wasm/lnmp_wasm_bg.wasm" });
  } catch (err) {
    console.warn("WASM init failed, falling back to pure JS parsing (dev only).", err);
  }

  const text = "F7=1\nF12=14532";
  const rec = lnmp.parse(text);
  console.log("Parsed record:", rec);
  console.log("Encode back:", lnmp.encode(rec));
  console.log("Encode binary base64:", Buffer.from(lnmp.encodeBinary(text)).toString("base64"));
  console.log("Decode binary:", lnmp.decodeBinary(Buffer.from(lnmp.encodeBinary(text)).toString("base64")));
  console.log("Schema:", JSON.stringify(lnmp.schemaDescribe("full"), null, 2));
  console.log("Explain:", lnmp.debugExplain(text));
}

run().catch(e => { console.error(e); process.exit(1); });
