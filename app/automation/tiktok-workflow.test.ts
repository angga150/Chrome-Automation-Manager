import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MultiAccountQueue,
  buildTikTokLoginWorkflow,
  createTikTokSessionConfig,
} from './tiktok-workflow.js';
import { TikTokRunner } from './tiktok-runner.js';
import { TikTokCredentialProvider } from './tiktok-credential-provider.js';
import { TikTokScheduler } from './tiktok-scheduler.js';

test('createTikTokSessionConfig creates a session config for a TikTok account', () => {
  const config = createTikTokSessionConfig('acct-demo', 'alice', 9333);

  assert.equal(config.sessionId, 'acct-demo');
  assert.equal(config.username, 'alice');
  assert.equal(config.port, 9333);
  assert.match(config.loginUrl, /tiktok\.com\/login/);
  assert.equal(config.status, 'idle');
});

test('buildTikTokLoginWorkflow returns a realistic login flow', () => {
  const workflow = buildTikTokLoginWorkflow('acct-demo', 'alice');

  assert.equal(workflow[0].action, 'navigate');
  assert.equal(workflow[1].action, 'wait');
  assert.equal(workflow[2].action, 'click');
  assert.equal(workflow[workflow.length - 1].action, 'screenshot');
  assert.match(workflow[0].url ?? '', /tiktok\.com/);
});

test('MultiAccountQueue executes tasks in FIFO order and keeps session grouping', () => {
  const queue = new MultiAccountQueue();

  const first = queue.enqueue('acct-1', 'navigate', { url: 'https://www.tiktok.com' });
  const second = queue.enqueue('acct-2', 'login', { username: 'alice' });
  const third = queue.enqueue('acct-1', 'screenshot', { path: 'capture.png' });

  assert.equal(queue.size(), 3);
  assert.deepEqual(queue.dequeue(), first);
  assert.deepEqual(queue.peek(), second);
  assert.deepEqual(queue.pendingForSession('acct-1')[0], third);
  assert.equal(queue.pendingForSession('acct-2').length, 1);
});

test('TikTokRunner resolves credentials from env and strips placeholder secrets', async () => {
  process.env.TIKTOK_USERNAME = 'alice';
  process.env.TIKTOK_PASSWORD = 'secret-pass';

  const runner = new TikTokRunner({ sessionId: 'acct-demo', profilePath: 'data/profiles/acct-demo', loginUrl: 'https://www.tiktok.com/login', status: 'idle', createdAt: new Date().toISOString() });
  const creds = await runner.resolveCredentials();

  assert.equal(creds.username, 'alice');
  assert.equal(creds.password, 'secret-pass');

  delete process.env.TIKTOK_USERNAME;
  delete process.env.TIKTOK_PASSWORD;
});

test('TikTokRunner builds a concrete execution plan for a login workflow', async () => {
  const runner = new TikTokRunner({
    sessionId: 'acct-demo',
    profilePath: 'data/profiles/acct-demo',
    loginUrl: 'https://www.tiktok.com/login',
    status: 'idle',
    createdAt: new Date().toISOString(),
    username: 'alice',
  });

  const plan = runner.buildExecutionPlan();

  assert.equal(plan[0].action, 'navigate');
  assert.equal(plan[plan.length - 1].action, 'screenshot');
  assert.ok(plan.some((step) => step.action === 'type'));
});

test('TikTokCredentialProvider resolves credentials from env and masks secrets', async () => {
  process.env.TIKTOK_USERNAME = 'alice';
  process.env.TIKTOK_PASSWORD = 'secret-pass';

  const provider = new TikTokCredentialProvider();
  const creds = await provider.resolveForAccount('acct-demo');

  assert.equal(creds.username, 'alice');
  assert.equal(creds.password, 'secret-pass');
  assert.match(provider.maskSecrets(creds).password ?? '', /\*/);

  delete process.env.TIKTOK_USERNAME;
  delete process.env.TIKTOK_PASSWORD;
});

test('TikTokScheduler keeps per-account tasks ordered and processes the next valid job', () => {
  const scheduler = new TikTokScheduler();

  const first = scheduler.enqueue({ accountId: 'acct-1', action: 'navigate', payload: { url: 'https://www.tiktok.com' } });
  const second = scheduler.enqueue({ accountId: 'acct-2', action: 'login', payload: { username: 'alice' } });

  assert.equal(scheduler.size(), 2);
  assert.equal(scheduler.pendingForAccount('acct-1').length, 1);
  assert.equal(scheduler.peek()?.id, first.id);
  assert.equal(scheduler.dequeue()?.id, first.id);
  assert.equal(scheduler.peek()?.id, second.id);
});
