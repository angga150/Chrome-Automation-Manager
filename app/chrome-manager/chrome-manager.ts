import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import type { ChromeLaunchOptions, ChromeProcessInfo } from '../shared/types.js';

export class ChromeManager {
  private static readonly DEFAULT_TIMEOUT_MS = 30000;

  static async waitUntilReady(port: number, timeoutMs = this.DEFAULT_TIMEOUT_MS): Promise<boolean> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          return true;
        }
      } catch {
        // Chrome is still starting.
      }

      await delay(500);
    }

    return false;
  }

  static async isRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  static async stop(pid: number): Promise<boolean> {
    if (!(await this.isRunning(pid))) {
      return false;
    }

    try {
      process.kill(pid, 'SIGTERM');
      await delay(3000);

      if (!(await this.isRunning(pid))) {
        return true;
      }
    } catch {
      // ignore and fallback below
    }

    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      return !(await this.isRunning(pid));
    }

    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      return false;
    }

    return !(await this.isRunning(pid));
  }

  static findChromeBinary(): string {
    const configured = process.env.CHROME_BIN ?? process.env.CHROME_PATH;
    if (configured && configured.trim()) {
      return configured.trim();
    }

    const windowsChromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const windowsChromePathX86 = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

    const candidates = [
      'google-chrome',
      'google-chrome-stable',
      'chrome',
      'chromium',
      'chromium-browser',
      windowsChromePath,
      windowsChromePathX86,
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    ];

    for (const candidate of candidates) {
      if (process.platform === 'win32') {
        if (existsSync(candidate)) {
          return candidate;
        }
        continue;
      }

      const whichResult = spawnSync('which', [candidate], { encoding: 'utf-8' });
      if (whichResult.status === 0 && whichResult.stdout.trim()) {
        return candidate;
      }
    }

    throw new Error('Google Chrome or Chromium binary not found on PATH. Set CHROME_BIN or CHROME_PATH to a valid browser executable.');
  }

  static async launch(options: ChromeLaunchOptions): Promise<ChromeProcessInfo> {
    const chromeBinary = this.findChromeBinary();
    const scriptPath = process.env.CHROME_SCRIPT;
    const args = [
      `--user-data-dir=${options.userDataDir ?? options.profilePath}`,
      `--remote-debugging-port=${options.debugPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-features=Translate',
      `--profile-directory=${options.sessionId}`,
      'tiktok.com',
      'tiktok.com',
      'tiktok.com',
      'youtube.com',
      'youtube.com',
      'youtube.com',
      
    ];

    const commandArgs = scriptPath ? [scriptPath, ...args] : args;

    const child = spawn(chromeBinary, commandArgs, {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
      windowsHide: true,
    });

    const pid = child.pid;
    if (!pid) {
      throw new Error('Failed to spawn Chrome process');
    }

    const ready = await this.waitUntilReady(options.debugPort);
    if (!ready) {
      await this.stop(pid);
      throw new Error(`Chrome failed to start on port ${options.debugPort}`);
    }

    writeFileSync(`${options.profilePath}.pid`, String(pid), 'utf8');

    return {
      pid,
      port: options.debugPort,
      profilePath: options.profilePath,
      userDataDir: options.userDataDir ?? options.profilePath,
      startedAt: new Date(),
    };
  }
}
