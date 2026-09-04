import { readFile, writeFile, rm } from 'node:fs/promises';

import { ChromeManager } from '../chrome-manager/chrome-manager.js';
import { PortAllocator } from '../port-allocator/port-allocator.js';
import { ProfileManager } from '../profile-manager/profile-manager.js';
import { CDPController } from '../cdp-controller/cdp-controller.js';
import { writeFileSync } from 'node:fs';
import { runWorkflow } from '../automation/workflow-runner.js';
import { MultiAccountQueue, buildTikTokLoginWorkflow, createTikTokSessionConfig } from '../automation/tiktok-workflow.js';
import TikTokRunner from '../automation/tiktok-runner.js';
import { TikTokCredentialProvider } from '../automation/tiktok-credential-provider.js';
import { TikTokScheduler } from '../automation/tiktok-scheduler.js';
import { TikTokAccountManager } from '../automation/tiktok-account-manager.js';

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

  if (command === 'run') {
    const wfFile = args[1];
    const portArg = args[2] ? Number(args[2]) : undefined;
    if (!wfFile) {
      console.error('Usage: run <workflow.json|yaml> [port]');
      process.exitCode = 1;
      return;
    }

    try {
      await runWorkflow(wfFile, portArg);
      console.log(JSON.stringify({ command: 'run', workflow: wfFile, port: portArg ?? null }, null, 2));
    } catch (e: any) {
      console.error('Workflow run failed:', e?.message ?? e);
      process.exitCode = 1;
    }

    return;
  }

  if (command === 'tiktok') {
    const subcommand = args[1];

    if (subcommand === 'session') {
      const sessionId = args[2] ?? 'tiktok-session';
      const username = args[3];
      const port = args[4] ? Number(args[4]) : undefined;
      const config = createTikTokSessionConfig(sessionId, username, port);
      console.log(JSON.stringify({ command: 'tiktok:session', session: config }, null, 2));
      return;
    }

    if (subcommand === 'workflow') {
      const sessionId = args[2] ?? 'tiktok-session';
      const username = args[3];
      const workflow = buildTikTokLoginWorkflow(sessionId, username);
      console.log(JSON.stringify({ command: 'tiktok:workflow', sessionId, username, steps: workflow }, null, 2));
      return;
    }

    if (subcommand === 'queue') {
      const queue = new MultiAccountQueue();
      const sessionId = args[2] ?? 'tiktok-session';
      const action = args[3] ?? 'navigate';
      const payload = args.slice(4).reduce<Record<string, string>>((acc, item) => {
        const [k, v] = item.split('=');
        if (k && v) acc[k] = v;
        return acc;
      }, {});

      const task = queue.enqueue(sessionId, action, payload);
      console.log(JSON.stringify({ command: 'tiktok:queue', task }, null, 2));
      return;
    }

    if (subcommand === 'run') {
      const sessionId = args[2] ?? 'tiktok-session';
      const username = args[3];
      const port = args[4] ? Number(args[4]) : 9222;
      const config = createTikTokSessionConfig(sessionId, username, port);
      const runner = new TikTokRunner(config);

      try {
        const result = await runner.executeWorkflow(port, { username });
        console.log(JSON.stringify({ command: 'tiktok:run', result }, null, 2));
      } catch (e: any) {
        console.error('TikTok run failed:', e?.message ?? e);
        process.exitCode = 1;
      }
      return;
    }

    if (subcommand === 'credentials') {
      const provider = new TikTokCredentialProvider();
      const accountId = args[2] ?? 'default';
      const username = args[3];
      const password = args[4];
      if (username && password) {
        await provider.storeForAccount(accountId, { username, password });
      }
      const resolved = await provider.resolveForAccount(accountId);
      console.log(JSON.stringify({ command: 'tiktok:credentials', accountId, masked: provider.maskSecrets(resolved) }, null, 2));
      return;
    }

    if (subcommand === 'scheduler') {
      const scheduler = new TikTokScheduler();
      const accountId = args[2] ?? 'acct-demo';
      const action = args[3] ?? 'navigate';
      const task = scheduler.enqueue({ accountId, action, payload: { raw: args.slice(4).join(' ') || 'pending' } });
      console.log(JSON.stringify({ command: 'tiktok:scheduler', queued: task, pending: scheduler.pendingForAccount(accountId) }, null, 2));
      return;
    }

    if (subcommand === 'account') {
      const manager = new TikTokAccountManager();
      const accountId = args[2] ?? 'acct-demo';
      const mode = args[3] ?? 'status';

      if (mode === 'register') {
        const state = manager.registerAccount(accountId, { status: 'idle' });
        console.log(JSON.stringify({ command: 'tiktok:account:register', state }, null, 2));
        return;
      }

      if (mode === 'enqueue') {
        const action = args[4] ?? 'navigate';
        const payload = { raw: args.slice(5).join(' ') || 'pending' };
        const job = manager.enqueue(accountId, action, payload);
        console.log(JSON.stringify({ command: 'tiktok:account:enqueue', job, pending: manager.pendingFor(accountId) }, null, 2));
        return;
      }

      if (mode === 'process') {
        const job = manager.processNext(accountId, { status: 'running' });
        console.log(JSON.stringify({ command: 'tiktok:account:process', job, state: manager.getAccount(accountId) }, null, 2));
        return;
      }

      if (mode === 'complete') {
        const state = manager.complete(accountId, 'success');
        console.log(JSON.stringify({ command: 'tiktok:account:complete', state }, null, 2));
        return;
      }

      const state = manager.getAccount(accountId) ?? manager.registerAccount(accountId, { status: 'idle' });
      console.log(JSON.stringify({ command: 'tiktok:account:status', state }, null, 2));
      return;
    }

    console.error('Usage: tiktok <session|workflow|queue|run|credentials|scheduler|account> ...');
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

TikTok-oriented commands:
  npx.cmd tsx app/cli/index.ts tiktok session <sessionId> [username] [port]
  npx.cmd tsx app/cli/index.ts tiktok workflow <sessionId> [username]
  npx.cmd tsx app/cli/index.ts tiktok queue <sessionId> [action] [key=value ...]
  npx.cmd tsx app/cli/index.ts tiktok run <sessionId> [username] [port]
  npx.cmd tsx app/cli/index.ts tiktok credentials <accountId> [username] [password]
  npx.cmd tsx app/cli/index.ts tiktok scheduler <accountId> [action] [payload]
  npx.cmd tsx app/cli/index.ts tiktok account <accountId> [register|enqueue|process|complete|status]

Help:
  npx.cmd tsx app/cli/index.ts help
`);
}
