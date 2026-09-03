import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

type RestartRecord = {
  count: number;
  firstAttemptAt: number;
};

const RESTART_FILE = (profilePath: string) => `${profilePath}.restarts.json`;

export class RecoveryManager {
  static async canRestart(profilePath: string, maxRestarts = 3, windowMs = 60 * 60 * 1000): Promise<boolean> {
    try {
      const file = RESTART_FILE(profilePath);
      if (!existsSync(file)) return true;
      const raw = await readFile(file, 'utf8');
      const rec: RestartRecord = JSON.parse(raw);
      const now = Date.now();
      if (now - rec.firstAttemptAt > windowMs) {
        // window expired — reset
        await this.reset(profilePath);
        return true;
      }
      return rec.count < maxRestarts;
    } catch {
      return true;
    }
  }

  static async recordRestart(profilePath: string): Promise<void> {
    const file = RESTART_FILE(profilePath);
    try {
      if (!existsSync(file)) {
        const rec: RestartRecord = { count: 1, firstAttemptAt: Date.now() };
        await writeFile(file, JSON.stringify(rec), 'utf8');
        return;
      }
      const raw = await readFile(file, 'utf8');
      const rec: RestartRecord = JSON.parse(raw);
      rec.count += 1;
      await writeFile(file, JSON.stringify(rec), 'utf8');
    } catch {
      // ignore
    }
  }

  static async reset(profilePath: string): Promise<void> {
    const file = RESTART_FILE(profilePath);
    try {
      await rm(file, { force: true });
    } catch {
      // ignore
    }
  }
}

export default RecoveryManager;
