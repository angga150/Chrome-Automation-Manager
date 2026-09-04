// background service worker for extension agent
// Configuration keys stored in chrome.storage.local for flexibility
const DEFAULT_WS_PORT = 9898;
const TOKEN_KEY = 'agent_token';
const SECRET_KEY = 'agent_secret';
const PORT_KEY = 'agent_port';

let ws = null;

async function connect() {
  try {
    let token = await getToken();
    // attempt to auto-discover config from local server if not set
    await tryAutoConfig({ attempts: 5, timeoutMs: 800 });
    const secret = await getSecret();
    const port = await getPort();
    // provide a safe default token so register payload is not empty
    if (!token) {
      token = 'dev-token';
      console.log('agent: no token in storage, using default dev-token');
    }
    const WS_PORT = Number(port || DEFAULT_WS_PORT);
    const HTTP_PORT = WS_PORT + 1;
    const SERVER = `ws://127.0.0.1:${WS_PORT}`;
    const CHALLENGE_URL = `http://127.0.0.1:${HTTP_PORT}/challenge`;
    if (!secret) {
      console.warn('agent: no secret set; cannot perform challenge-response');
    }

    // fetch challenge
    // get challenge and compute signature before sending register
    let nonce = null;
    try {
      const r = await fetch(CHALLENGE_URL, { method: 'GET' });
      const j = await r.json();
      nonce = j.nonce;
    } catch (e) {
      console.warn('agent: failed to get challenge', e);
    }

    let signature = null;
    if (nonce && secret) {
      signature = await computeHmacHex(secret, nonce);
    }

    // ensure only one WS is active
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      console.log('agent: existing ws in progress, will reuse');
    } else {
      ws = new WebSocket(SERVER);
      ws.addEventListener('open', () => {
        console.log('agent: ws open');
      });
    }

    // wait for open
    await waitForWsOpen(ws, 5000);

    // require secret/signature to register; if missing, retry connect later
    if (!secret) {
      console.warn('agent: secret not available yet, will retry connect in 3s');
      setTimeout(connect, 3000);
      return;
    }

    // only send register when we have required fields
    if (!token || !nonce || !signature) {
      console.warn('agent: missing token/nonce/signature, aborting register', { token: !!token, nonce: !!nonce, signature: !!signature });
    } else {
      // try to associate with active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = (tabs[0] && tabs[0].id) || null;
        safeWsSend(ws, JSON.stringify({ type: 'register', tabId, token, nonce, signature }));
      });
    }

    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        console.log('agent: ws message', msg && msg.type, msg);
        if (msg && msg.type === 'command' && msg.tabId) {
          // forward to content script and wait for response to ACK
          chrome.tabs.sendMessage(msg.tabId, { action: msg.action, payload: msg.payload }, (response) => {
            try {
              if (chrome.runtime.lastError) {
                console.warn('agent: sendMessage lastError', chrome.runtime.lastError.message);
              }
              const status = response && response.ok ? 'ok' : 'error';
              safeWsSend(ws, JSON.stringify({ type: 'ack', id: msg.id, status, result: response }));
            } catch (e) {
              console.warn('agent: error handling command response', e);
            }
          });
        }
      } catch (e) {
        console.error('agent: failed parse message', e);
      }
    });

    ws.addEventListener('close', () => {
      console.log('agent: ws closed, retrying in 3s');
      ws = null;
      setTimeout(connect, 3000);
    });
  } catch (e) {
    console.error('agent: connect failed', e);
    setTimeout(connect, 5000);
  }
}

// try to discover server config by probing a range of HTTP ports (WS port+1)
async function tryAutoConfig(opts = { attempts: 3, timeoutMs: 600 }) {
  // if already have secret/port, skip
  const s = await getSecret();
  const p = await getPort();
  if (s && p) return;

  const start = DEFAULT_WS_PORT;
  const end = DEFAULT_WS_PORT + 12; // probe a small range
  for (let wp = start; wp <= end; wp++) {
    const httpPort = wp + 1;
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), opts.timeoutMs || 600);
      const resp = await fetch(`http://127.0.0.1:${httpPort}/config`, { signal: controller.signal });
      clearTimeout(id);
      if (!resp.ok) continue;
      const j = await resp.json();
      if (j && j.ok && j.config) {
        const cfg = j.config;
        const toSet = {};
        if (cfg.secret) toSet[SECRET_KEY] = cfg.secret;
        if (cfg.port) toSet[PORT_KEY] = cfg.port;
        if (Object.keys(toSet).length) {
          chrome.storage.local.set(toSet);
        }
        return;
      }
    } catch (e) {
      // ignore and try next
    }
  }
}

// wait for a WebSocket to become open
function waitForWsOpen(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    if (!ws) return reject(new Error('no ws'));
    try {
      if (ws.readyState === WebSocket.OPEN) return resolve();
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onClose = (ev) => {
        cleanup();
        reject(new Error('ws closed'));
      };
      const onError = (e) => {
        cleanup();
        reject(e || new Error('ws error'));
      };
      const to = setTimeout(() => {
        cleanup();
        reject(new Error('ws open timeout'));
      }, timeoutMs);
      function cleanup() {
        clearTimeout(to);
        try { ws.removeEventListener('open', onOpen); } catch {}
        try { ws.removeEventListener('close', onClose); } catch {}
        try { ws.removeEventListener('error', onError); } catch {}
      }
      ws.addEventListener('open', onOpen);
      ws.addEventListener('close', onClose);
      ws.addEventListener('error', onError);
    } catch (e) {
      reject(e);
    }
  });
}

// send safely on ws, waiting for OPEN if necessary
function safeWsSend(ws, payload, timeoutMs = 3000) {
  try {
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      return;
    }
    if (ws.readyState === WebSocket.CONNECTING) {
      waitForWsOpen(ws, timeoutMs).then(() => {
        try { ws.send(payload); } catch (e) { console.warn('agent: ws send failed after open', e); }
      }).catch((e) => {
        console.warn('agent: ws never opened, send aborted', e);
      });
      return;
    }
    // otherwise, try recreate connection
    try {
      ws = new WebSocket(ws.url);
      waitForWsOpen(ws, timeoutMs).then(() => { try { ws.send(payload); } catch (e) { console.warn('agent: ws send failed post recreate', e); } }).catch(() => {});
    } catch (e) {
      console.warn('agent: safeWsSend failed to recreate ws', e);
    }
  } catch (e) {
    console.warn('agent: safeWsSend unexpected error', e);
  }
}

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TOKEN_KEY], (items) => {
      resolve(items[TOKEN_KEY] || null);
    });
  });
}

// ensure connect on worker startup
connect();

// allow runtime messages to set token
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'set-token') {
    chrome.storage.local.set({ [TOKEN_KEY]: msg.token }, () => sendResponse({ ok: true }));
    return true; // keep sendResponse
  }
  if (msg && msg.type === 'set-secret') {
    chrome.storage.local.set({ [SECRET_KEY]: msg.secret }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'set-port') {
    chrome.storage.local.set({ [PORT_KEY]: msg.port }, () => sendResponse({ ok: true }));
    return true;
  }
});

async function getSecret() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SECRET_KEY], (items) => {
      resolve(items[SECRET_KEY] || null);
    });
  });
}

async function getPort() {
  return new Promise((resolve) => {
    chrome.storage.local.get([PORT_KEY], (items) => {
      resolve(items[PORT_KEY] || null);
    });
  });
}

async function computeHmacHex(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const arr = Array.from(new Uint8Array(sig));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}
