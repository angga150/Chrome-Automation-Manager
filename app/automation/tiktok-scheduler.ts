export type TikTokJob = {
  id: string;
  accountId: string;
  action: string;
  payload: Record<string, any>;
  createdAt: string;
  scheduledFor?: number;
};

export class TikTokScheduler {
  private readonly jobs: TikTokJob[] = [];

  enqueue(job: Omit<TikTokJob, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): TikTokJob {
    const createdAt = job.createdAt ?? new Date().toISOString();
    const item: TikTokJob = {
      id: job.id ?? `${job.accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      accountId: job.accountId,
      action: job.action,
      payload: job.payload ?? {},
      createdAt,
      scheduledFor: job.scheduledFor ?? Date.now(),
    };

    this.jobs.push(item);
    return item;
  }

  dequeue(): TikTokJob | null {
    if (this.jobs.length === 0) return null;
    const [next] = this.jobs.sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0));
    const index = this.jobs.indexOf(next);
    if (index >= 0) this.jobs.splice(index, 1);
    return next;
  }

  peek(): TikTokJob | null {
    if (this.jobs.length === 0) return null;
    return this.jobs.slice().sort((a, b) => (a.scheduledFor ?? 0) - (b.scheduledFor ?? 0))[0] ?? null;
  }

  pendingForAccount(accountId: string): TikTokJob[] {
    return this.jobs.filter((job) => job.accountId === accountId);
  }

  size(): number {
    return this.jobs.length;
  }

  clear(): void {
    this.jobs.length = 0;
  }
}

export default TikTokScheduler;
