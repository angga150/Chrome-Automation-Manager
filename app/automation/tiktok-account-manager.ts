export type TikTokAccountStatus = 'idle' | 'running' | 'login-required' | 'error';

export type TikTokAccountJob = {
  id: string;
  accountId: string;
  action: string;
  payload: Record<string, any>;
  createdAt: string;
};

export type TikTokAccountState = {
  accountId: string;
  status: TikTokAccountStatus;
  lastError?: string;
  updatedAt: string;
  queue: TikTokAccountJob[];
};

export class TikTokAccountManager {
  private readonly accounts = new Map<string, TikTokAccountState>();

  registerAccount(accountId: string, overrides: Partial<TikTokAccountState> = {}): TikTokAccountState {
    const existing = this.accounts.get(accountId);
    if (existing) {
      const merged: TikTokAccountState = {
        ...existing,
        ...overrides,
        accountId,
        updatedAt: overrides.updatedAt ?? existing.updatedAt ?? new Date().toISOString(),
        queue: overrides.queue ?? existing.queue ?? [],
      };
      this.accounts.set(accountId, merged);
      return merged;
    }

    const next: TikTokAccountState = {
      accountId,
      status: overrides.status ?? 'idle',
      lastError: overrides.lastError,
      updatedAt: overrides.updatedAt ?? new Date().toISOString(),
      queue: overrides.queue ?? [],
    };

    this.accounts.set(accountId, next);
    return next;
  }

  getAccount(accountId: string): TikTokAccountState | undefined {
    return this.accounts.get(accountId);
  }

  enqueue(accountId: string, action: string, payload: Record<string, any> = {}): TikTokAccountJob {
    const account = this.registerAccount(accountId);
    const job: TikTokAccountJob = {
      id: `${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      accountId,
      action,
      payload,
      createdAt: new Date().toISOString(),
    };

    account.queue.push(job);
    account.updatedAt = new Date().toISOString();
    return job;
  }

  pendingFor(accountId: string): TikTokAccountJob[] {
    return this.getAccount(accountId)?.queue ?? [];
  }

  nextFor(accountId: string): TikTokAccountJob | null {
    const queue = this.pendingFor(accountId);
    return queue[0] ?? null;
  }

  peekNext(): TikTokAccountJob | null {
    for (const accountId of this.accounts.keys()) {
      const queue = this.pendingFor(accountId);
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return null;
  }

  processNext(accountId: string, options: { status?: TikTokAccountStatus } = {}): TikTokAccountJob | null {
    const account = this.registerAccount(accountId);
    const next = account.queue.shift();
    if (!next) return null;

    account.status = options.status ?? 'running';
    account.updatedAt = new Date().toISOString();
    return next;
  }

  complete(accountId: string, result: 'success' | 'error' = 'success'): TikTokAccountState {
    const account = this.registerAccount(accountId);
    account.status = result === 'success' ? 'idle' : 'error';
    account.updatedAt = new Date().toISOString();
    if (result === 'success') {
      account.lastError = undefined;
    }
    return account;
  }

  fail(accountId: string, reason: string): TikTokAccountState {
    const account = this.registerAccount(accountId);
    account.status = 'error';
    account.lastError = reason;
    account.updatedAt = new Date().toISOString();
    return account;
  }

  snapshot(): TikTokAccountState[] {
    return Array.from(this.accounts.values()).map((account) => ({
      ...account,
      queue: [...account.queue],
    }));
  }
}

export default TikTokAccountManager;
