import type { Tool } from "@modelcontextprotocol/sdk";
import { lnmp } from "../bindings/lnmp";

export const encodeBinaryTool: Tool = {
  name: "lnmp.encodeBinary",
  description: "Encodes LNMP text to binary (returned base64-encoded)",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string" },
      mode: { type: "string", enum: ["strict", "lenient"], description: "Lenient mode auto-sanitizes and repairs LLM-style text" },
      sanitize: { type: "boolean", description: "Force-enable/disable sanitizer pre-pass (defaults to true for lenient)" },
      sanitizeOptions: {
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
      binary: { type: "string" },
      sanitized: { type: "boolean" },
      sanitizedText: { type: "string" },
      mode: { type: "string" },
    },
  },
  handler: async ({ text, mode, sanitize, sanitizeOptions }) => {
    await lnmp.ready();
    const selectedMode = mode === "strict" ? "strict" : "lenient";
    const shouldSanitize = sanitize !== undefined ? !!sanitize : selectedMode === "lenient";
    const sanitized = shouldSanitize ? lnmp.sanitize(text, sanitizeOptions) : { text, changed: false };
    const bin = lnmp.encodeBinary(sanitized.text, { mode: selectedMode, sanitize: false });
    const base64 = Buffer.from(bin).toString("base64");
    return {
      binary: base64,
      sanitized: shouldSanitize,
      sanitizedText: sanitized.changed ? sanitized.text : undefined,
      mode: selectedMode,
    };
  },
};
