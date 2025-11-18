import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const debugExplainTool: Tool = {
  name: "lnmp.debug.explain",
  description: "Explain LNMP text in human readable debug comments",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  outputSchema: { type: "object", properties: { explanation: { type: "string" } } },
  handler: async ({ text }) => {
    await lnmp.ready();
    const explanation = lnmp.debugExplain(text);
    return { explanation };
  },
};
