import assert from 'node:assert/strict';
import test from 'node:test';

import { TikTokAccountManager, type TikTokAccountStatus } from './tiktok-account-manager.js';

test('TikTokAccountManager tracks account health and schedules tasks by account', () => {
  const manager = new TikTokAccountManager();
  manager.registerAccount('acct-1', { status: 'idle' });
  manager.registerAccount('acct-2', { status: 'login-required' });

  const queued = manager.enqueue('acct-1', 'navigate', { url: 'https://www.tiktok.com' });
  manager.enqueue('acct-2', 'login', { username: 'alice' });

  assert.equal(manager.getAccount('acct-1')?.status, 'idle');
  assert.equal(manager.pendingFor('acct-1').length, 1);
  assert.equal(manager.pendingFor('acct-2').length, 1);
  assert.equal(manager.nextFor('acct-1')?.id, queued.id);
  assert.equal(manager.peekNext()?.accountId, 'acct-1');
});

test('TikTokAccountManager marks account status on processing and completion', () => {
  const manager = new TikTokAccountManager();
  manager.registerAccount('acct-3', { status: 'idle' });
  manager.enqueue('acct-3', 'login', { username: 'bob' });

  const processed = manager.processNext('acct-3', { status: 'running' });

  assert.equal(processed?.accountId, 'acct-3');
  assert.equal(manager.getAccount('acct-3')?.status, 'running');

  manager.complete('acct-3', 'success');
  assert.equal(manager.getAccount('acct-3')?.status, 'idle');
  assert.equal(manager.pendingFor('acct-3').length, 0);
});

test('TikTokAccountManager supports error state transitions', () => {
  const manager = new TikTokAccountManager();
  manager.registerAccount('acct-4', { status: 'idle' });
  manager.enqueue('acct-4', 'navigate', { url: 'https://www.tiktok.com' });

  const current = manager.processNext('acct-4', { status: 'running' });
  manager.fail('acct-4', 'target blocked');

  assert.equal(current?.accountId, 'acct-4');
  assert.equal(manager.getAccount('acct-4')?.status, 'error');
  assert.equal(manager.getAccount('acct-4')?.lastError, 'target blocked');
});

type StatusTuple = {
  status: TikTokAccountStatus;
};

const statuses: StatusTuple[] = [
  { status: 'idle' },
  { status: 'running' },
  { status: 'login-required' },
  { status: 'error' },
];

assert.equal(statuses.length, 4);
