const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 3000, path }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', (e) => reject(e));
  });
}

function post(path, data) {
  return new Promise((resolve, reject) => {
    const s = JSON.stringify(data || {});
    const req = http.request({ host: '127.0.0.1', port: 3000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) } }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => reject(e));
    req.write(s);
    req.end();
  });
}

(async () => {
  try {
    console.log('GET /health');
    console.log(await get('/health'));

    console.log('\nGET /sessions');
    console.log(await get('/sessions'));

    console.log('\nPOST /sessions/demo-session/start');
    console.log(await post('/sessions/demo-session/start', { port: 9222 }));
  } catch (e) {
    console.error('ERROR', e && e.message ? e.message : e);
  }
})();
