#!/usr/bin/env node
/* Wrapper for the compiled http_server module in dist/. This script runs the HTTP
 * test server for local development and integration testing. It expects the
 * module to export `runStandalone` or `startHttpServer`.
 */
(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const httpServer = require('../dist/http_server.js');
    const run = httpServer.runStandalone || httpServer.startHttpServer;
    await run();
  } catch (err) {
    console.error('Failed to start HTTP server:', err);
    process.exit(1);
  }
})();
