import { readFile, writeFile, rm } from 'node:fs/promises';

import { ChromeManager } from '../chrome-manager/chrome-manager.js';
import { PortAllocator } from '../port-allocator/port-allocator.js';
import { ProfileManager } from '../profile-manager/profile-manager.js';
import { CDPController } from '../cdp-controller/cdp-controller.js';
import { writeFileSync } from 'node:fs';

export async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const profileManager = new ProfileManager();

  if (command === 'launch') {
    const sessionId = args[1] ?? 'default-session';
    const preferredPort = args[2] ? Number(args[2]) : undefined;

    const profilePath = profileManager.createProfile(sessionId);
    const port = preferredPort ?? (await PortAllocator.allocatePort());

    const processInfo = await ChromeManager.launch({
      profilePath,
      debugPort: port,
      userDataDir: profilePath,
      sessionId,
    });

    await writeFile(`${profilePath}.pid`, String(processInfo.pid), 'utf8');

    console.log(JSON.stringify({
      command: 'launch',
      sessionId,
      profilePath,
      debugPort: processInfo.port,
      pid: processInfo.pid,
    }, null, 2));
    return;
  }

  if (command === 'stop') {
    const sessionId = args[1] ?? 'default-session';
    const profilePath = profileManager.getProfilePath(sessionId);
    const pidFile = `${profilePath}.pid`;

    let pid = 0;
    try {
      const pidRaw = await readFile(pidFile, 'utf8');
      pid = Number(pidRaw.trim());
    } catch {
      // no pid file available
    }

    if (!pid || Number.isNaN(pid)) {
      console.error(`No running process found for session ${sessionId}`);
      process.exitCode = 1;
      return;
    }

    const stopped = await ChromeManager.stop(pid);
    if (stopped) {
      try {
        await rm(pidFile, { force: true });
      } catch {
        // ignore errors when removing pid file
      }
    }

    console.log(JSON.stringify({ command: 'stop', sessionId, pid, stopped }, null, 2));
    return;
  }

  if (command === 'status') {
    const sessions = profileManager.listProfiles();

    const results: Array<Record<string, any>> = [];
    for (const sessionId of sessions) {
      const profilePath = profileManager.getProfilePath(sessionId);
      const pidFile = `${profilePath}.pid`;
      let pid: number | null = null;
      try {
        const pidRaw = await readFile(pidFile, 'utf8');
        pid = Number(pidRaw.trim());
      } catch {
        // no pid file
      }

      let running = false;
      if (pid && !Number.isNaN(pid)) {
        try {
          running = await ChromeManager.isRunning(pid);
        } catch {
          running = false;
        }
      }

      results.push({ sessionId, profilePath, pid, running });
    }

    console.log(JSON.stringify({ command: 'status', sessions: results }, null, 2));
    return;
  }

  if (command === 'cdp') {
    const sub = args[1];
    if (sub === 'navigate') {
      const port = Number(args[2]);
      const url = args[3];
      if (!port || !url) {
        console.error('Usage: cdp navigate <port> <url>');
        process.exitCode = 1;
        return;
      }

      const ctrl = await CDPController.create(port);
      await ctrl.navigate(url);
      await ctrl.close();
      console.log(JSON.stringify({ command: 'cdp:navigate', port, url }, null, 2));
      return;
    }

    if (sub === 'screenshot') {
      const port = Number(args[2]);
      const out = args[3] ?? `screenshot-${port}.png`;
      if (!port) {
        console.error('Usage: cdp screenshot <port> [out.png]');
        process.exitCode = 1;
        return;
      }

      const ctrl = await CDPController.create(port);
      const buf = await ctrl.screenshot({ format: 'png' });
      writeFileSync(out, buf);
      await ctrl.close();
      console.log(JSON.stringify({ command: 'cdp:screenshot', port, out }, null, 2));
      return;
    }

    console.error('Unknown cdp subcommand');
    process.exitCode = 1;
    return;
  }

  printHelp();
}

function printHelp(): void {
  console.log(`Chrome Automation Manager

Usage (from project root):
  npx.cmd tsx app/cli/index.ts launch <sessionId> [port]    # create + start session
  npx.cmd tsx app/cli/index.ts stop <sessionId>            # stop session
  npx.cmd tsx app/cli/index.ts status                      # list sessions and running state

CDP helper commands (connect to Chrome debug port):
  npx.cmd tsx app/cli/index.ts cdp navigate <port> <url>    # navigate a running Chrome
  npx.cmd tsx app/cli/index.ts cdp screenshot <port> [out] # capture screenshot

Help:
  npx.cmd tsx app/cli/index.ts help
`);
}
