import http from 'http';
import crypto from 'crypto';
import WebSocket from 'ws';
import { promises as fs } from 'fs';
import path from 'path';

// read server config written by server
let PORT = 9904;
let TOKEN = 'dev-token';
let SECRET = 'dev-secret';
try {
  const cfgRaw = await fs.readFile(path.join(process.cwd(), 'data', 'agent-config.json'), 'utf8').catch(() => null);
  if (cfgRaw) {
    const cfg = JSON.parse(cfgRaw);
    if (cfg.port) PORT = cfg.port;
    if (cfg.secret) SECRET = cfg.secret;
  }
} catch (e) {
  // ignore
}

function getChallenge() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT+1}/challenge`, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async function(){
  try {
    const c = await getChallenge();
    console.log('challenge', c);
    const nonce = c.nonce;
    const sig = crypto.createHmac('sha256', SECRET).update(nonce).digest('hex');
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    ws.on('open', () => {
      console.log('ws open, sending register');
      ws.send(JSON.stringify({ type: 'register', token: TOKEN, nonce, signature: sig, tabId: 123 }));
    });
    ws.on('message', (data) => {
      console.log('ws message', data.toString());
      const msg = JSON.parse(data.toString());
      if (msg.type === 'registered') {
        console.log('registered id', msg.id);
        // send ack for registration
        setTimeout(() => {
          ws.send(JSON.stringify({ type: 'ack', id: msg.id }));
          console.log('sent ack for', msg.id);
        }, 500);
      }
      if (msg.type === 'command') {
        console.log('received command', msg);
        // simulate executing command and send ack
        setTimeout(() => {
          ws.send(JSON.stringify({ type: 'ack', id: msg.id, status: 'ok', result: { echo: msg.action } }));
          console.log('sent ack for command', msg.id);
        }, 300);
      }
    });
    ws.on('error', (e) => console.error('ws error', e));
    ws.on('close', () => console.log('ws closed'));
  } catch (e) {
    console.error('error', e);
  }
})();
