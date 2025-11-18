class Server {
  constructor(opts) {
    this.opts = opts || {};
    this.tools = [];
    this.running = false;
  }
  tool(t) {
    this.tools.push(t);
  }
  async start() {
    this.running = true;
    return Promise.resolve();
  }
  async stop() {
    this.running = false;
    return Promise.resolve();
  }
}

module.exports = { Server };
