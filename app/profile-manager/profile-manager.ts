import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export class ProfileManager {
  private readonly rootDir: string;

  constructor(rootDir = join(process.cwd(), 'data', 'profiles')) {
    this.rootDir = rootDir;
    mkdirSync(this.rootDir, { recursive: true });
  }

  createProfile(sessionId: string): string {
    if (!sessionId || !sessionId.trim()) {
      throw new Error('Session ID is required to create a profile');
    }

    const profilePath = this.getProfilePath(sessionId);
    mkdirSync(profilePath, { recursive: true });
    return profilePath;
  }

  getProfilePath(sessionId: string): string {
    return join(this.rootDir, sessionId);
  }

  listProfiles(): string[] {
    if (!existsSync(this.rootDir)) {
      return [];
    }

    return readdirSync(this.rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  deleteProfile(sessionId: string): void {
    const profilePath = this.getProfilePath(sessionId);
    if (existsSync(profilePath)) {
      rmSync(profilePath, { recursive: true, force: true });
    }
  }

  isProfileLocked(profilePath: string): boolean {
    return existsSync(join(profilePath, 'SingletonLock'));
  }
}
