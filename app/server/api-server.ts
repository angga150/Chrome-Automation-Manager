import http from 'node:http';
import net from 'node:net';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import { ChromeManager } from '../chrome-manager/index.js';
import { ProfileManager } from '../profile-manager/profile-manager.js';
import { PortAllocator } from '../port-allocator/port-allocator.js';

// Simple dashboard auth: set DASHBOARD_TOKEN env or data/dashboard-token.txt
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || null;

let wsBroadcast: ((msg: any) => void) | null = null;

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');
const DEFAULT_PORT = Number(process.env.DASHBOARD_PORT ?? 3000);

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

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '', `http://localhost`);
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
    return json(res, 200, { ok: true, sessions });
  }

  if (req.method === 'GET' && url.pathname === '/metrics') {
    const sessions = await listSessionsFromProfiles();
    const running = sessions.filter((s) => s.pid).length;
    return json(res, 200, { ok: true, metrics: { session_count: sessions.length, running_sessions: running } });
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
      try { await writeSessionFile(sessionId, { pid: null }); } catch {}
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
