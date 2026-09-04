import assert from 'node:assert/strict';
import test from 'node:test';

import { TikTokOrchestrator } from './tiktok-orchestrator.js';

test('TikTokOrchestrator processes the next queued job for an account and updates state', async () => {
  const orchestrator = new TikTokOrchestrator();

  orchestrator.enqueue('acct-1', 'navigate', { url: 'https://www.tiktok.com' });
  orchestrator.enqueue('acct-2', 'login', { username: 'alice' });

  const result = await orchestrator.processNext(async (job) => {
    assert.equal(job.accountId, 'acct-1');
    return { ok: true, jobId: job.id };
  });

  assert.equal(result?.ok, true);
  assert.equal(orchestrator.accountSnapshot('acct-1')?.status, 'running');
  assert.equal(orchestrator.pendingCount('acct-1'), 0);
  assert.equal(orchestrator.pendingCount('acct-2'), 1);
});

test('TikTokOrchestrator completes a job successfully and keeps the next pending job ready', async () => {
  const orchestrator = new TikTokOrchestrator();

  orchestrator.enqueue('acct-3', 'navigate', { url: 'https://www.tiktok.com' });
  orchestrator.enqueue('acct-3', 'screenshot', { path: 'shot.png' });

  await orchestrator.processNext(async () => ({ ok: true }));
  orchestrator.complete('acct-3', 'success');

  assert.equal(orchestrator.accountSnapshot('acct-3')?.status, 'idle');
  assert.equal(orchestrator.pendingCount('acct-3'), 1);
  assert.equal(orchestrator.peekNext()?.accountId, 'acct-3');
});

test('TikTokOrchestrator keeps manually logged-in sessions visible as tracked accounts', () => {
  const orchestrator = new TikTokOrchestrator();

  orchestrator.registerAccount('demo-dashboard', { status: 'idle', lastError: undefined });

  const snapshot = orchestrator.snapshot();
  assert.equal(snapshot.some((account) => account.accountId === 'demo-dashboard'), true);
  assert.equal(orchestrator.accountSnapshot('demo-dashboard')?.status, 'idle');
});
