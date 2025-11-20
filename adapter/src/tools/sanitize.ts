import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp, SanitizeOptions } from "../bindings/lnmp";

export const sanitizeTool: Tool = {
  name: "lnmp.sanitize",
  description: "Leniently sanitizes LNMP-like text (quotes, escapes, whitespace) before parsing or encoding",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string" },
      options: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["minimal", "normal", "aggressive"] },
          autoQuoteStrings: { type: "boolean" },
          autoEscapeQuotes: { type: "boolean" },
          normalizeBooleans: { type: "boolean" },
          normalizeNumbers: { type: "boolean" },
        },
      },
    },
    required: ["text"],
  },
  outputSchema: {
    type: "object",
    properties: {
      text: { type: "string" },
      changed: { type: "boolean" },
      config: { type: "object" },
    },
  },
  handler: async ({ text, options }: { text: string; options?: SanitizeOptions }) => {
    await lnmp.ready();
    const res = lnmp.sanitize(text, options || {});
    return { text: res.text, changed: res.changed, config: res.config || {} };
  },
};
