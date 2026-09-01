import { readFile, writeFile } from 'node:fs/promises';

import { ChromeManager } from '../chrome-manager/chrome-manager.js';
import { PortAllocator } from '../port-allocator/port-allocator.js';
import { ProfileManager } from '../profile-manager/profile-manager.js';

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
    console.log(JSON.stringify({ command: 'stop', sessionId, pid, stopped }, null, 2));
    return;
  }

  if (command === 'status') {
    console.log('Status command not implemented yet in Phase 1');
    return;
  }

  printHelp();
}

function printHelp(): void {
  console.log(`Chrome Automation Manager - Phase 1

Usage:
  node app/cli/index.ts launch <sessionId> [port]
  node app/cli/index.ts stop <sessionId>
  node app/cli/index.ts help
`);
}
