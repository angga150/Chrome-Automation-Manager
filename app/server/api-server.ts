import http from 'node:http';
import net from 'node:net';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { ChromeManager } from '../chrome-manager/index.js';
import { ProfileManager } from '../profile-manager/profile-manager.js';
import { PortAllocator } from '../port-allocator/port-allocator.js';
import { TikTokOrchestrator } from '../automation/tiktok-orchestrator.js';
import AutomationEngine from '../automation/automation-engine.js';

// Simple dashboard auth: set DASHBOARD_TOKEN env or data/dashboard-token.txt
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || null;

let wsBroadcast: ((msg: any) => void) | null = null;

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');
const DEFAULT_PORT = Number(process.env.DASHBOARD_PORT ?? 3000);
const orchestrator = new TikTokOrchestrator();

async function executeQueuedJob(job: { accountId: string; action: string; payload?: Record<string, any> }): Promise<void> {
  const sessions = await listSessionsFromProfiles();
  const session = sessions.find((entry) => entry.sessionId === job.accountId);
  if (!session) throw new Error(`session-not-found:${job.accountId}`);

  const port = Number(session.meta?.port ?? session.meta?.debugPort ?? 9222);
  if (!Number.isFinite(port) || port <= 0) throw new Error(`port-not-found:${job.accountId}`);

  const url = job.payload?.videoUrl ?? job.payload?.url ?? 'https://www.tiktok.com';
  const engine = await AutomationEngine.connect(port);
  try {
    if (job.action === 'like') {
      await engine.navigate(url);
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const selectors = [
        'button[aria-label*="Like"], button[aria-label*="like"], [data-e2e="like-button"]',
        'button[title*="Like"], button[title*="like"]',
        'div[role="button"][aria-label*="Like"], div[role="button"][aria-label*="like"]'
      ];

      let liked = false;
      for (const selector of selectors) {
        try {
          await engine.click(selector);
          liked = true;
          break;
        } catch {
          // try next selector
        }
      }

      if (!liked) {
        await engine.evaluate(`(() => {
          const selectors = ${JSON.stringify(selectors)};
          const matches = [];
          for (const node of Array.from(document.querySelectorAll('button, [role="button"], [data-e2e], div'))) {
            const text = [
              node.getAttribute('aria-label'),
              node.getAttribute('title'),
              node.getAttribute('data-e2e'),
              node.textContent || '',
              node.className ? String(node.className) : ''
            ].join(' ').toLowerCase();
            if (/like|heart|favorite/i.test(text)) matches.push(node);
          }
          const target = matches.find((node) => node && typeof node.click === 'function');
          if (!target) throw new Error('like-button-not-found');
          target.scrollIntoView({ block: 'center', inline: 'center' });
          target.click();
          return true;
        })()`);
        liked = true;
      }
    } else if (job.action === 'navigate') {
      await engine.navigate(url);
    } else {
      await engine.navigate(url);
    }
  } finally {
    await engine.close();
  }
}

async function processQueuedJobs(): Promise<void> {
  const next = orchestrator.peekNext();
  if (!next) return;

  const result = await orchestrator.processNext(async (job) => {
    try {
      await executeQueuedJob(job);
      return { ok: true, jobId: job.id, accountId: job.accountId };
    } catch (error: any) {
      return { ok: false, accountId: job.accountId, jobId: job.id, error: error?.message ?? String(error) };
    }
  });

  if (result && typeof result === 'object' && 'ok' in result && result.ok === true) {
    orchestrator.complete(String(next.accountId), 'success');
  } else if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
    orchestrator.fail(String(next.accountId), (result as any).error ?? 'job-failed');
  }
}

async function isPortFree(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, '127.0.0.1');
  });
}

async function findFreePort(startPort: number, maxAttempts = 20): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port available starting from ${startPort}`);
}

async function ensureDir() {
  await mkdir(SESSIONS_DIR, { recursive: true }).catch(() => {});
}

function json(res: http.ServerResponse, code: number, obj: any) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function readSessionFile(sessionId: string) {
  try {
    const raw = await readFile(path.join(SESSIONS_DIR, `${sessionId}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeSessionFile(sessionId: string, data: any) {
  await ensureDir();
  await writeFile(path.join(SESSIONS_DIR, `${sessionId}.json`), JSON.stringify(data, null, 2), 'utf8');
}

async function listSessionsFromProfiles() {
  const pm = new ProfileManager();
  const profiles = pm.listProfiles();
  const sessions: any[] = [];
  for (const s of profiles) {
    const meta = await readSessionFile(s);
    const profilePath = pm.getProfilePath(s);
    let pid: number | null = null;
    try {
      const pidRaw = await readFile(`${profilePath}.pid`, 'utf8');
      pid = Number(pidRaw.trim());
    } catch {}
    sessions.push({ sessionId: s, pid, profilePath, meta });
  }
  return sessions;
}

function registerSessionAccounts(sessions: any[]) {
  for (const session of sessions) {
    const accountId = String(session.sessionId || 'default-session');
    orchestrator.registerAccount(accountId, {
      status: session.pid ? 'running' : 'idle',
      updatedAt: new Date().toISOString(),
      lastError: undefined,
      queue: orchestrator.accountSnapshot(accountId)?.queue ?? [],
    });
  }
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '', `http://localhost`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-dashboard-token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // write request log for debugging
  try {
    await mkdir(path.join(process.cwd(), 'data', 'logs'), { recursive: true }).catch(() => {});
    await appendFile(path.join(process.cwd(), 'data', 'logs', 'api.log'), `${new Date().toISOString()} ${req.method} ${url.pathname}\n`);
  } catch {}
  // simple token auth for non-health endpoints
  if (url.pathname !== '/health') {
    const token = req.headers['x-dashboard-token'] as string | undefined;
    if (DASHBOARD_TOKEN && token !== DASHBOARD_TOKEN) {
      return json(res, 401, { ok: false, reason: 'unauthorized' });
    }
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/sessions') {
    const sessions = await listSessionsFromProfiles();
    registerSessionAccounts(sessions);
    return json(res, 200, { ok: true, sessions });
  }

  if (req.method === 'GET' && url.pathname === '/metrics') {
    const sessions = await listSessionsFromProfiles();
    registerSessionAccounts(sessions);
    const running = sessions.filter((s) => s.pid).length;
    const accounts = orchestrator.snapshot();
    return json(res, 200, { ok: true, metrics: { session_count: sessions.length, running_sessions: running, account_count: accounts.length, running_accounts: accounts.filter((account) => account.status === 'running').length } });
  }

  if (req.method === 'GET' && url.pathname === '/queue') {
    const queue = orchestrator.snapshot().flatMap((account) => account.queue.map((job) => ({ ...job, accountStatus: account.status })));
    return json(res, 200, { ok: true, queue });
  }

  if (req.method === 'GET' && url.pathname === '/accounts') {
    const sessions = await listSessionsFromProfiles();
    registerSessionAccounts(sessions);
    const accounts = orchestrator.snapshot();
    return json(res, 200, { ok: true, accounts });
  }

  if (req.method === 'POST' && url.pathname === '/jobs/bulk') {
    try {
      const body: Buffer[] = [];
      for await (const chunk of req) body.push(chunk as Buffer);
      const data = body.length ? JSON.parse(Buffer.concat(body).toString('utf8')) : {};
      const action = data.action ?? 'like';
      const videoUrl = data.videoUrl ?? data.url ?? data.payload?.url ?? null;
      const accountIds = Array.isArray(data.accountIds) && data.accountIds.length > 0 ? data.accountIds : (await listSessionsFromProfiles()).map((session) => session.sessionId);
      const jobs = accountIds.map((accountId: string) => orchestrator.enqueue(String(accountId), action, { url: videoUrl, videoUrl, raw: data.payload ?? {} }));
      return json(res, 200, { ok: true, action, videoUrl, accountIds, jobs });
    } catch (e: any) {
      return json(res, 500, { ok: false, reason: String(e) });
    }
  }

  const matchAccount = url.pathname.match(/^\/accounts\/([^\/]+)$/);
  if (req.method === 'GET' && matchAccount) {
    const accountId = matchAccount[1];
    const state = orchestrator.accountSnapshot(accountId) ?? { accountId, status: 'idle', queue: [], updatedAt: new Date().toISOString() };
    return json(res, 200, { ok: true, account: state });
  }

  const matchAccountJobs = url.pathname.match(/^\/accounts\/([^\/]+)\/jobs$/);
  if (req.method === 'POST' && matchAccountJobs) {
    const accountId = matchAccountJobs[1];
    try {
      const body: Buffer[] = [];
      for await (const chunk of req) body.push(chunk as Buffer);
      const data = body.length ? JSON.parse(Buffer.concat(body).toString('utf8')) : {};
      const action = data.action ?? 'navigate';
      const payload = data.payload ?? data ?? {};
      const job = orchestrator.enqueue(accountId, action, payload);
      return json(res, 200, { ok: true, job });
    } catch (e: any) {
      return json(res, 500, { ok: false, reason: String(e) });
    }
  }

  const matchStart = url.pathname.match(/^\/sessions\/([^\/]+)\/start$/);
  if (req.method === 'POST' && matchStart) {
    const sessionId = matchStart[1];
    try {
      const pm = new ProfileManager();
      pm.createProfile(sessionId);
      const body: Buffer[] = [];
      for await (const chunk of req) body.push(chunk as Buffer);
      const data = body.length ? JSON.parse(Buffer.concat(body).toString('utf8')) : {};
      const preferredPort = data.port;
      const port = await PortAllocator.allocatePort(preferredPort);
      const dry = process.env.DASHBOARD_DRY_RUN === 'true';
      let meta: any;
      if (dry) {
        // simulate launch in dry-run mode (no real Chrome)
        const fakePid = Math.floor(10000 + Math.random() * 50000);
        meta = { pid: fakePid, port, profilePath: pm.getProfilePath(sessionId), startedAt: new Date().toISOString(), dryRun: true };
        // write a pid file to mimic real launch
        try { await writeFile(`${pm.getProfilePath(sessionId)}.pid`, String(fakePid), 'utf8'); } catch {}
      } else {
        const info = await ChromeManager.launch({ sessionId, profilePath: pm.getProfilePath(sessionId), debugPort: port });
        meta = { pid: info.pid, port: info.port, profilePath: info.profilePath, startedAt: info.startedAt };
      }
      await writeSessionFile(sessionId, meta);
      // emit event to websocket clients
      if (wsBroadcast) wsBroadcast({ type: 'session_started', sessionId, meta });
      return json(res, 200, { ok: true, session: meta });
    } catch (e: any) {
      return json(res, 500, { ok: false, reason: String(e) });
    }
  }

  const matchStop = url.pathname.match(/^\/sessions\/([^\/]+)\/stop$/);
  if (req.method === 'POST' && matchStop) {
    const sessionId = matchStop[1];
    try {
      const pm = new ProfileManager();
      const profilePath = pm.getProfilePath(sessionId);
      let pid: number | null = null;
      try { const raw = await readFile(`${profilePath}.pid`, 'utf8'); pid = Number(raw.trim()); } catch {}
      if (!pid) return json(res, 400, { ok: false, reason: 'no-running-process' });
      const stopped = await ChromeManager.stop(pid);
      try { await unlink(`${profilePath}.pid`); } catch {}
      try { await writeSessionFile(sessionId, { pid: null, stoppedAt: new Date().toISOString() }); } catch {}
      if (wsBroadcast) wsBroadcast({ type: 'session_stopped', sessionId, stopped });
      return json(res, 200, { ok: true, stopped });
    } catch (e: any) {
      return json(res, 500, { ok: false, reason: String(e) });
    }
  }

  const matchDetail = url.pathname.match(/^\/sessions\/([^\/]+)$/);
  if (req.method === 'GET' && matchDetail) {
    const sessionId = matchDetail[1];
    const pm = new ProfileManager();
    const profilePath = pm.getProfilePath(sessionId);
    let pid: number | null = null;
    try { const p = await readFile(`${profilePath}.pid`, 'utf8'); pid = Number(p.trim()); } catch {}
    const meta = await readSessionFile(sessionId);
    return json(res, 200, { ok: true, session: { sessionId, pid, meta } });
  }

  res.writeHead(404); res.end();
}

async function main() {
  await ensureDir();
  let activePort = DEFAULT_PORT;
  try {
    activePort = await findFreePort(DEFAULT_PORT);
    if (activePort !== DEFAULT_PORT) {
      console.warn(`Dashboard port ${DEFAULT_PORT} is busy; falling back to ${activePort}`);
    }
  } catch (e) {
    console.error('Failed to find free dashboard port', e);
    process.exit(1);
  }

  const server = http.createServer(handleRequest);
  const queueLoop = setInterval(() => {
    void processQueuedJobs();
  }, 4000);

  server.on('close', () => clearInterval(queueLoop));
  server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error('Dashboard API failed to start: port already in use', activePort);
    } else {
      console.error('Dashboard API server error', err);
    }
    process.exit(1);
  });
  server.listen(activePort, () => console.log(`Dashboard API listening on http://127.0.0.1:${activePort}`));

  // try to attach WebSocket server if `ws` available
  try {
    const wsMod = await import('ws');
    const wsApi: any = wsMod as any;
    const WebSocketServer = wsApi.WebSocketServer || wsApi.Server || wsApi.default?.WebSocketServer || wsApi.default?.Server;
    if (WebSocketServer) {
      const wss = new WebSocketServer({ server });
      wss.on('connection', (socket: any) => {
        console.log('Dashboard WebSocket: client connected');
      });
      wsBroadcast = (msg: any) => {
        const str = JSON.stringify(msg);
        wss.clients.forEach((c: any) => { if (c.readyState === 1) c.send(str); });
      };
      console.log('Dashboard WebSocket attached');
    }
  } catch (e) {
    console.warn('ws module not available; realtime events disabled');
  }
}

if (process.argv[1].endsWith('api-server.ts') || process.argv[1].endsWith('api-server.js')) {
  main().catch((e) => { console.error('Failed to start API server', e); process.exit(1); });
}

export default main;
