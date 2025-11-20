import { createServer } from "../src/server";
import { parseTool } from "../src/tools/parse";

async function run() {
  const server = createServer();
  await server.start();

  // Call the handler directly for test purposes.
  const input = { text: "F7=1 F12=14532" };
  console.log("Invoking parse tool...", await parseTool.handler(input as any));

  await server.stop();
}

run();
