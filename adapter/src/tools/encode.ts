import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const encodeTool: Tool = {
  name: "lnmp.encode",
  description: "Encodes a structured LNMP record into text",
  inputSchema: {
    type: "object",
    properties: { record: { type: "object" } },
    required: ["record"],
  },
  outputSchema: { type: "object", properties: { text: { type: "string" } } },
  handler: async ({ record }) => {
    await lnmp.ready();
    const text = lnmp.encode(record);
    return { text };
  },
};
