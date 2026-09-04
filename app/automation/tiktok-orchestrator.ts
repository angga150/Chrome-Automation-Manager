import { TikTokAccountManager, type TikTokAccountState } from './tiktok-account-manager.js';
import { TikTokScheduler, type TikTokJob } from './tiktok-scheduler.js';

export type TikTokOrchestratorTaskResult = {
  ok: boolean;
  jobId?: string;
  accountId?: string;
  error?: string;
};

export class TikTokOrchestrator {
  private readonly accounts = new TikTokAccountManager();
  private readonly scheduler = new TikTokScheduler();

  registerAccount(accountId: string, overrides: Partial<TikTokAccountState> = {}): TikTokAccountState {
    return this.accounts.registerAccount(accountId, overrides);
  }

  enqueue(accountId: string, action: string, payload: Record<string, any> = {}): TikTokJob {
    const job = this.scheduler.enqueue({ accountId, action, payload });
    this.accounts.enqueue(accountId, action, payload);
    return job;
  }

  pendingCount(accountId: string): number {
    return this.accounts.pendingFor(accountId).length;
  }

  accountSnapshot(accountId: string): TikTokAccountState | undefined {
    return this.accounts.getAccount(accountId);
  }

  peekNext(): TikTokJob | null {
    return this.scheduler.peek();
  }

  async processNext<T>(executor: (job: TikTokJob) => Promise<T | TikTokOrchestratorTaskResult>): Promise<T | TikTokOrchestratorTaskResult | null> {
    const job = this.scheduler.dequeue();
    if (!job) return null;

    this.accounts.processNext(job.accountId, { status: 'running' });
    try {
      const result = await executor(job);
      return result;
    } catch (error: any) {
      this.accounts.fail(job.accountId, error?.message ?? 'unknown error');
      return { ok: false, accountId: job.accountId, jobId: job.id, error: error?.message ?? 'unknown error' };
    }
  }

  complete(accountId: string, status: 'success' | 'error' = 'success'): TikTokAccountState {
    return this.accounts.complete(accountId, status);
  }

  fail(accountId: string, reason: string): TikTokAccountState {
    return this.accounts.fail(accountId, reason);
  }

  snapshot(): TikTokAccountState[] {
    return this.accounts.snapshot();
  }
}

export default TikTokOrchestrator;
