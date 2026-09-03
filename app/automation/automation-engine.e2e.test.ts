import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { PortAllocator } from '../port-allocator/port-allocator.js';
import { ProfileManager } from '../profile-manager/profile-manager.js';
import { ChromeManager } from '../chrome-manager/chrome-manager.js';
import AutomationEngine from './automation-engine.js';

test('e2e: AutomationEngine navigate and screenshot', async (t) => {
  try {
    ChromeManager.findChromeBinary();
  } catch {
    t.skip('Chrome binary not found (set CHROME_BIN to run E2E)');
    return;
  }

  const profileManager = new ProfileManager();
  const session = 'automation-e2e-session';
  try { rmSync(profileManager.getProfilePath(session), { recursive: true, force: true }); } catch {}

  const profile = profileManager.createProfile(session);
  const port = await PortAllocator.allocatePort();
  const info = await ChromeManager.launch({ profilePath: profile, debugPort: port, sessionId: session });

  t.after(async () => {
    try { await ChromeManager.stop(info.pid); } catch {}
    try { rmSync(profileManager.getProfilePath(session), { recursive: true, force: true }); } catch {}
    try { rmSync(join(process.cwd(), `automation-e2e-${port}.png`), { force: true }); } catch {}
  });

  const engine = await AutomationEngine.connect(port);
  await engine.navigate('https://example.com');
  const buf = await engine.screenshot({ format: 'png' });
  const out = join(process.cwd(), `automation-e2e-${port}.png`);
  writeFileSync(out, buf);
  assert(existsSync(out), 'Screenshot file should exist');

  await engine.close();

  const stopped = await ChromeManager.stop(info.pid);
  assert(stopped, 'Chrome should stop cleanly');
});
