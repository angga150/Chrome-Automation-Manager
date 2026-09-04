import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

export type TikTokAccountCredentials = {
  username?: string;
  password?: string;
};

export class TikTokCredentialProvider {
  constructor(private readonly credentialsPath = path.join(process.cwd(), 'data', 'credentials', 'tiktok-accounts.json')) {}

  maskSecrets(record: TikTokAccountCredentials): TikTokAccountCredentials {
    return {
      username: record.username,
      password: record.password ? '***redacted***' : undefined,
    };
  }

  private async readStoredCredentials(): Promise<Record<string, TikTokAccountCredentials>> {
    try {
      const raw = await readFile(this.credentialsPath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async resolveForAccount(accountId: string): Promise<TikTokAccountCredentials> {
    const envUsername = process.env.TIKTOK_USERNAME ?? process.env[`TIKTOK_${accountId.toUpperCase()}_USERNAME`] ?? undefined;
    const envPassword = process.env.TIKTOK_PASSWORD ?? process.env[`TIKTOK_${accountId.toUpperCase()}_PASSWORD`] ?? undefined;

    if (envUsername || envPassword) {
      return {
        username: envUsername && envUsername.trim() ? envUsername.trim() : undefined,
        password: envPassword && envPassword.trim() && envPassword !== '[REDACTED]' ? envPassword.trim() : undefined,
      };
    }

    const store = await this.readStoredCredentials();
    const entry = store[accountId] ?? {};
    return {
      username: entry.username,
      password: entry.password,
    };
  }

  async storeForAccount(accountId: string, credentials: TikTokAccountCredentials): Promise<void> {
    const store = await this.readStoredCredentials();
    store[accountId] = {
      username: credentials.username,
      password: credentials.password,
    };
    await mkdir(path.dirname(this.credentialsPath), { recursive: true });
    await writeFile(this.credentialsPath, JSON.stringify(store, null, 2), 'utf8');
  }
}

export default TikTokCredentialProvider;
