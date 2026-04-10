/**
 * gateway.js – Kombiniert Bank-Server (3000) und Angreifer-Server (4000)
 * hinter einem einzigen Port (5000) für ngrok Free-Plan.
 *
 * Routing:
 *   /steal*        →  Angreifer-Server (4000)  – vom XSS-Payload gerufen
 *   /attacker*     →  Angreifer-Server (4000)  – Dashboard
 *   /clear         →  Angreifer-Server (4000)  – Reset
 *   alles andere   →  Bank-Server (3000)
 */

const http = require('http');

const GATEWAY_PORT = 5001;
const BANK_PORT    = 3000;
const ATK_PORT     = 4000;

// Pfade die zum Angreifer-Server geroutet werden
function isAttackerRoute(path) {
  return path === '/steal' ||
         path.startsWith('/steal?') ||
         path.startsWith('/attacker') ||
         path === '/clear';
}

const server = http.createServer((req, res) => {
  const targetPort = isAttackerRoute(req.url) ? ATK_PORT : BANK_PORT;

  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${targetPort}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    // CORS-Header ergänzen (nötig damit XSS-Fetch-Aufruf des Opfers
    // nicht vom Browser blockiert wird)
    proxyRes.headers['access-control-allow-origin'] = '*';
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    console.error(`[Gateway] Proxy-Fehler (Port ${targetPort}):`, err.message);
    res.writeHead(502);
    res.end('Gateway-Fehler: Ziel-Server nicht erreichbar.');
  });

  req.pipe(proxy, { end: true });
});

server.listen(GATEWAY_PORT, () => {
  console.log(`[Gateway] läuft auf http://localhost:${GATEWAY_PORT}`);
  console.log(`[Gateway]   /steal*, /attacker*, /clear  →  :${ATK_PORT}`);
  console.log(`[Gateway]   alles andere                 →  :${BANK_PORT}`);
});
