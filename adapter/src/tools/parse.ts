import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const parseTool: Tool = {
  name: "lnmp.parse",
  description: "Parses LNMP text format into a structured record",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string" },
      strict: { type: "boolean", description: "When true, disable fallback and enforce strict parsing" },
      mode: { type: "string", enum: ["strict", "lenient"], description: "Selects parser mode; defaults to lenient for LLM inputs" },
    },
    required: ["text"],
  },
  outputSchema: { type: "object", properties: { record: { type: "object" } } },
  handler: async ({ text, strict, mode }) => {
    await lnmp.ready();
    const parserMode = strict ? "strict" : (mode === "strict" ? "strict" : "lenient");
    const allowFallback = strict ? false : true;
    const record = lnmp.parse(text, { mode: parserMode, allowFallback });
    return { record };
  },
};
