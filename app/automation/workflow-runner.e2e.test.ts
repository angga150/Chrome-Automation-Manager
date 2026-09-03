import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { PortAllocator } from '../port-allocator/port-allocator.js';
import { ProfileManager } from '../profile-manager/profile-manager.js';
import { ChromeManager } from '../chrome-manager/chrome-manager.js';
import { runWorkflow } from './workflow-runner.js';

test('e2e: workflow-runner execute navigate+screenshot', async (t) => {
  try {
    ChromeManager.findChromeBinary();
  } catch {
    t.skip('Chrome binary not found (set CHROME_BIN to run E2E)');
    return;
  }

  const profileManager = new ProfileManager();
  const session = 'workflow-e2e-session';
  try { rmSync(profileManager.getProfilePath(session), { recursive: true, force: true }); } catch {}

  const profile = profileManager.createProfile(session);
  const port = await PortAllocator.allocatePort();
  const info = await ChromeManager.launch({ profilePath: profile, debugPort: port, sessionId: session });

  t.after(async () => {
    try { await ChromeManager.stop(info.pid); } catch {}
    try { rmSync(profileManager.getProfilePath(session), { recursive: true, force: true }); } catch {}
    try { rmSync(join(process.cwd(), `workflow-e2e-${port}.png`), { force: true }); } catch {}
    try { rmSync(join(process.cwd(), `workflow-${port}.json`), { force: true }); } catch {}
  });

  const wf = {
    port,
    steps: [
      { action: 'navigate', url: 'https://example.com' },
      { action: 'screenshot', out: `workflow-e2e-${port}.png` }
    ]
  };

  const wfFile = join(process.cwd(), `workflow-${port}.json`);
  writeFileSync(wfFile, JSON.stringify(wf, null, 2), 'utf8');

  await runWorkflow(wfFile, port);

  const out = join(process.cwd(), `workflow-e2e-${port}.png`);
  assert(existsSync(out), 'Workflow screenshot should exist');

  const stopped = await ChromeManager.stop(info.pid);
  assert(stopped, 'Chrome should stop cleanly');
});
