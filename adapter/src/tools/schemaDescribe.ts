import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const schemaDescribeTool: Tool = {
  name: "lnmp.schema.describe",
  description: "Describe the LNMP schema so LLMs can interpret records",
  inputSchema: { type: "object", properties: { mode: { type: "string" } } },
  outputSchema: { type: "object", properties: { fields: { type: "object" } } },
  handler: async ({ mode }) => {
    await lnmp.ready();
    const res = lnmp.schemaDescribe(mode || "full");
    return { fields: res?.fields || {} };
  },
};
