import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ChromeManager } from './chrome-manager.js';

function createFakeChromeScript(binDir: string): string {
  const scriptPath = join(binDir, 'fake-chrome.js');

  const script = `
const http = require('http');
const portArg = process.argv.find((arg) => arg.startsWith('--remote-debugging-port='));
const port = Number((portArg ?? '--remote-debugging-port=9222').split('=')[1]);

const server = http.createServer((req, res) => {
  if (req.url === '/json/version') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ Browser: 'FakeChrome', Port: port }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(port, '127.0.0.1');
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
`;

  writeFileSync(scriptPath, script, { encoding: 'utf8' });
  return scriptPath;
}

test('ChromeManager.launch starts a browser process and exposes a debug port', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'chrome-manager-launch-'));
  const profilePath = join(tempRoot, 'profile-a');
  const chromeScript = createFakeChromeScript(tempRoot);

  const previousBin = process.env.CHROME_BIN;
  const previousScript = process.env.CHROME_SCRIPT;
  process.env.CHROME_BIN = process.execPath;
  process.env.CHROME_SCRIPT = chromeScript;

  try {
    const info = await ChromeManager.launch({
      profilePath,
      debugPort: 9322,
      userDataDir: profilePath,
      sessionId: 'session-a',
    });

    assert.ok(info.pid > 0, 'pid should be present');
    assert.equal(info.port, 9322);
    assert.equal(info.profilePath, profilePath);

    const stillRunning = await ChromeManager.isRunning(info.pid);
    assert.equal(stillRunning, true);

    const stopped = await ChromeManager.stop(info.pid);
    assert.equal(stopped, true);

    const stillRunningAfterStop = await ChromeManager.isRunning(info.pid);
    assert.equal(stillRunningAfterStop, false);
  } finally {
    if (previousBin === undefined) {
      delete process.env.CHROME_BIN;
    } else {
      process.env.CHROME_BIN = previousBin;
    }

    if (previousScript === undefined) {
      delete process.env.CHROME_SCRIPT;
    } else {
      process.env.CHROME_SCRIPT = previousScript;
    }

    rmSync(tempRoot, { recursive: true, force: true });
  }
});
