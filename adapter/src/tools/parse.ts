import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const parseTool: Tool = {
  name: "lnmp.parse",
  description: "Parses LNMP text format into a structured record",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" }, strict: { type: "boolean" } },
    required: ["text"],
  },
  outputSchema: { type: "object", properties: { record: { type: "object" } } },
  handler: async ({ text, strict }) => {
    await lnmp.ready();
    if (strict) {
      const prev = lnmp.getParseFallback();
      lnmp.setParseFallback(false);
      try {
        const record = lnmp.parse(text);
        lnmp.setParseFallback(prev);
        return { record };
      } catch (err) {
        lnmp.setParseFallback(prev);
        throw err;
      }
    }
    const record = lnmp.parse(text);
    return { record };
  },
};
