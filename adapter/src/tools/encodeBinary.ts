import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const encodeBinaryTool: Tool = {
  name: "lnmp.encodeBinary",
  description: "Encodes LNMP text to binary (returned base64-encoded)",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  outputSchema: { type: "object", properties: { binary: { type: "string" } } },
  handler: async ({ text }) => {
    await lnmp.ready();
    const bin = lnmp.encodeBinary(text);
    const base64 = Buffer.from(bin).toString("base64");
    return { binary: base64 };
  },
};
