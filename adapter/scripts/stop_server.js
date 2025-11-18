#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');

const pidFile = path.join(os.tmpdir(), 'lnmp_http_server.pid');
if (!fs.existsSync(pidFile)) {
  console.error('PID file not found, is server running?');
  process.exit(1);
}
const pidText = fs.readFileSync(pidFile, 'utf8').trim();
const pid = Number(pidText || 0);
if (!pid) {
  console.error('Invalid pid in file');
  process.exit(1);
}
try {
  process.kill(pid);
  console.log('Killed server with pid', pid);
  fs.unlinkSync(pidFile);
  process.exit(0);
} catch (err) {
  console.error('Failed to kill pid', pid, err);
  process.exit(1);
}
