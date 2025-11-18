import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const decodeBinaryTool: Tool = {
  name: "lnmp.decodeBinary",
  description: "Decodes base64-encoded LNMP binary into text format",
  inputSchema: { type: "object", properties: { binary: { type: "string" } }, required: ["binary"] },
  outputSchema: { type: "object", properties: { text: { type: "string" } } },
  handler: async ({ binary }) => {
    await lnmp.ready();
    const text = lnmp.decodeBinary(binary);
    return { text };
  },
};
