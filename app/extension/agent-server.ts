import http from 'node:http';
import net from 'node:net';

let PORT = Number(process.env.EXT_AGENT_PORT ?? 9898);
const TOKEN = process.env.EXT_AGENT_TOKEN ?? 'dev-token';
const SECRET = process.env.EXT_AGENT_SECRET ?? 'dev-secret';

type NonceRecord = { nonce: string; expiresAt: number };
const nonces: Map<string, NonceRecord> = new Map();

function generateNonce(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function storeNonce(nonce: string, ttl = 60_000) {
  nonces.set(nonce, { nonce, expiresAt: Date.now() + ttl });
}

function validateAndConsumeNonce(nonce: string): boolean {
  const rec = nonces.get(nonce);
  if (!rec) return false;
  if (Date.now() > rec.expiresAt) {
    nonces.delete(nonce);
    return false;
  }
  nonces.delete(nonce);
  return true;
}

type ClientInfo = { ws: any; tabId: number | null };
const clients = new Map<string, ClientInfo>();
import { promises as fs } from 'node:fs';
import path from 'node:path';

const QUEUE_DIR = path.join(process.cwd(), 'data', 'agent-queue');
const CONFIG_FILE = path.join(process.cwd(), 'data', 'agent-config.json');
const DISPATCH_INTERVAL_MS = 3000;
const ACK_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 5;

async function startWss() {
  const wsMod = await import('ws');
  const WebSocketServer = (wsMod as any).WebSocketServer || (wsMod as any).Server || (wsMod as any).default?.WebSocketServer || (wsMod as any).default?.Server;
  const WSSConstructor: any = WebSocketServer;
  if (!WSSConstructor) throw new Error('No WebSocketServer constructor found in ws module');
  // create a WSS that does not listen on its own port; it will be attached to
  // the HTTP server via the 'upgrade' event to avoid binding the same port twice.
  const wss = new WSSConstructor({ noServer: true });
  wss.on('connection', (ws: any) => {
    ws.on('message', async (data: any) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === 'register') {
          // expect { token, nonce, signature }
          const { token, nonce, signature } = msg;
          if (!token || !nonce || !signature) {
            ws.send(JSON.stringify({ type: 'error', reason: 'invalid register payload' }));
            ws.terminate();
            return;
          }
          // validate nonce
          if (!validateAndConsumeNonce(nonce)) {
            ws.send(JSON.stringify({ type: 'error', reason: 'invalid or expired nonce' }));
            ws.terminate();
            return;
          }
          // validate signature: HMAC(secret, nonce)
          const crypto = await import('node:crypto');
          const expected = crypto.createHmac('sha256', SECRET).update(nonce).digest('hex');
          if (signature !== expected) {
            ws.send(JSON.stringify({ type: 'error', reason: 'invalid signature' }));
            ws.terminate();
            return;
          }
          const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
          clients.set(id, { ws, tabId: msg.tabId ?? null });
          console.log(`Client registered ${id} tab:${msg.tabId ?? 'null'}`);
          // DEV auto-dispatch removed in favor of explicit HTTP /command calls
          ws.send(JSON.stringify({ type: 'registered', id }));
          return;
        }

        if (msg.type === 'ack') {
          const { id } = msg;
          if (id) {
            const file = path.join(QUEUE_DIR, `${id}.json`);
            try {
              await fs.unlink(file);
              console.log(`Command ${id} acknowledged and removed from queue`);
            } catch {
              // ignore
            }
          }
          return;
        }
      } catch (e) {
        // ignore
      }
    });
  });
  return wss;
}

async function findFreePort(startPort: number, maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const p = startPort + i * 2; // keep HTTP at p+1
    const free = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.once('error', () => {
        resolve(false);
      });
      s.once('listening', () => {
        s.close(() => resolve(true));
      });
      s.listen(p);
    });
    if (free) return p;
  }
  throw new Error(`no free port found starting at ${startPort}`);
}

async function main() {
  try {
    PORT = await findFreePort(PORT, 20);
  } catch (e) {
    console.error('Could not find free port for agent server', e);
    process.exit(1);
  }

  const wss = await startWss().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start WebSocket server', e);
    process.exit(1);
  });

  // attach upgrade handler to HTTP server so WS upgrades are handled on same port
  server.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    try {
      // handleUpgrade expects raw Socket; cast if needed
      wss.handleUpgrade(req, socket as any, head, (ws: any) => {
        wss.emit('connection', ws, req);
      });
    } catch (e) {
      // ensure socket closed on error
      try { socket.destroy(); } catch {}
    }
  });

  // persist chosen config so extension can auto-discover
  try {
    await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true }).catch(() => {});
    await fs.writeFile(CONFIG_FILE, JSON.stringify({ secret: SECRET, port: PORT }, null, 2), 'utf8');
    console.log('Wrote agent config to', CONFIG_FILE);
  } catch (e) {
    console.warn('Failed to write agent config', e);
  }

}

// ensure queue dir
fs.mkdir(QUEUE_DIR, { recursive: true }).catch(() => {});

async function enqueueCommand(cmd: any) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const item = { id, tabId: cmd.tabId, action: cmd.action, payload: cmd.payload, retries: 0, nextAttempt: Date.now() };
  await fs.writeFile(path.join(QUEUE_DIR, `${id}.json`), JSON.stringify(item, null, 2), 'utf8');
  console.log(`Enqueued command ${id} for tab ${cmd.tabId}`);
  // try immediate delivery
  tryDeliverCommand(item).catch(() => {});
  return item;
}

async function tryDeliverCommand(cmd: any) {
  for (const [id, info] of clients.entries()) {
    if (info.tabId === cmd.tabId) {
      try {
        console.log(`Delivering command ${cmd.id} to client ${id} (tab:${cmd.tabId})`);
        info.ws.send(JSON.stringify({ type: 'command', id: cmd.id, tabId: cmd.tabId, action: cmd.action, payload: cmd.payload }));
        console.log(`Sent command ${cmd.id} to client ${id}`);
        cmd.lastSentAt = Date.now();
        cmd.retries = (cmd.retries || 0) + 1;
        cmd.nextAttempt = Date.now() + Math.min(1000 * 2 ** (cmd.retries - 1), 30_000);
        await fs.writeFile(path.join(QUEUE_DIR, `${cmd.id}.json`), JSON.stringify(cmd, null, 2), 'utf8');
      } catch (e) {
        console.warn(`Failed to send command ${cmd.id} to client ${id}`, e);
      }
      return;
    }
  }
}

setInterval(async () => {
  try {
    const files = await fs.readdir(QUEUE_DIR);
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(QUEUE_DIR, f), 'utf8');
        const cmd = JSON.parse(raw);
        if ((cmd.nextAttempt || 0) <= Date.now()) {
          if ((cmd.retries || 0) >= MAX_RETRIES) {
            console.warn(`Command ${cmd.id} exceeded max retries, removing`);
            await fs.unlink(path.join(QUEUE_DIR, f));
            continue;
          }
          await tryDeliverCommand(cmd);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}, DISPATCH_INTERVAL_MS);

// simple HTTP endpoint to send command to a client by tabId
const server = http.createServer(async (req, res) => {
  // expose config endpoints
  if (req.method === 'GET' && req.url === '/config') {
    try {
      const raw = await fs.readFile(CONFIG_FILE, 'utf8').catch(() => null);
      if (!raw) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'no-config' }));
        return;
      }
      const cfg = JSON.parse(raw);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, config: cfg }));
    } catch (e: any) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: String(e) }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/set-config') {
    try {
      const body: Buffer[] = [];
      for await (const chunk of req) body.push(chunk as Buffer);
      const data = JSON.parse(Buffer.concat(body).toString('utf8'));
      const cfg = { secret: data.secret ?? SECRET, port: data.port ?? PORT };
      await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true }).catch(() => {});
      await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e: any) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: String(e) }));
    }
    return;
  }
  if (req.method === 'POST' && req.url?.startsWith('/command')) {
    try {
      const body: Buffer[] = [];
      for await (const chunk of req) body.push(chunk as Buffer);
      const data = JSON.parse(Buffer.concat(body).toString('utf8'));
      const { tabId, action, payload } = data;
      if (!tabId || !action) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, reason: 'tabId and action required' }));
        return;
      }
      console.log(`HTTP /command received tab=${tabId} action=${action}`);
      const item = await enqueueCommand({ tabId, action, payload });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, queued: true, id: item.id }));
    } catch (e: any) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: String(e) }));
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/queue') {
    try {
      await fs.mkdir(QUEUE_DIR, { recursive: true });
      const files = await fs.readdir(QUEUE_DIR);
      const items = [] as any[];
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(QUEUE_DIR, f), 'utf8');
          items.push(JSON.parse(raw));
        } catch {}
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, items }));
    } catch (e: any) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: String(e) }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

// server.listen will be started from main() after a free port is selected

// add HTTP challenge endpoint
import { createServer } from 'node:http';
const httpServer = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/challenge') {
    const nonce = generateNonce();
    storeNonce(nonce);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ nonce }));
    return;
  }
  // default
  res.writeHead(404);
  res.end();
});

// httpServer.listen will be started from main() after a free port is selected

// start the servers now that helper functions are defined
main().then(() => {
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Extension agent server listening on ws/http port ${PORT} (token=${TOKEN})`);
  });

  httpServer.listen(PORT + 1, () => {
    // eslint-disable-next-line no-console
    console.log(`Extension agent HTTP challenge endpoint listening on port ${PORT + 1}`);
  });
}).catch((e) => {
  console.error('Failed to start agent server main', e);
  process.exit(1);
});
