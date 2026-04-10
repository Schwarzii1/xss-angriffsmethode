const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// -------------------------------------------------------
// Nutzer-Datenbank
// -------------------------------------------------------
const USERS = {
  'admin': { password: 'admin123',   role: 'Admin',   iban: null,                         kontostand: null  },
  'alice': { password: 'passwort123', role: 'Kunde',  iban: 'DE89 3704 0044 0532 0130 00', kontostand: 12450.00 },
  'bob':   { password: 'sicher456',  role: 'Kunde',   iban: 'DE27 2005 0550 1234 5678 90', kontostand: 320.50   },
};

// Session-Store
const sessions = {};

// Transaktionshistorie
const transaktionen = [];

// Support-Anfragen
const supportAnfragen = [];

// Demo-Schutzschalter
let inputValidation = false;

// Erkannte XSS-Angriffe
const xssAngriffe = [];

function containsXSS(str) {
  return /<[^>]*>|javascript:|on\w+\s*=/i.test(str);
}

function safeRender(str) {
  if (!inputValidation) return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function logXSS(user, feld, payload) {
  xssAngriffe.push({
    timestamp: new Date().toLocaleString('de-DE'),
    von: user,
    feld,
    payload,
  });
  console.log(`[XSS BLOCKIERT] ${user} → Feld: ${feld} | Payload: ${payload}`);
}

function generateToken(username) {
  const token = `sess-${username}-${Math.random().toString(36).slice(2)}`;
  sessions[token] = username;
  return token;
}

function getUser(req) {
  const token = req.cookies.session;
  if (!token || !sessions[token]) return null;
  const username = sessions[token];
  return { username, ...USERS[username] };
}

function formatEuro(betrag) {
  return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// -------------------------------------------------------
// CSS
// -------------------------------------------------------
const css = `
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #f4f6f9; }
  nav { background: #003366; color: white; padding: 12px 20px; border-radius: 6px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
  nav span { font-weight: bold; font-size: 1.1em; }
  nav a { color: #aac8f0; text-decoration: none; margin-left: 16px; font-size: 0.9em; }
  nav a:hover { color: white; }
  h1 { color: #003366; }
  h2 { color: #003366; border-bottom: 2px solid #003366; padding-bottom: 6px; }
  .card { background: white; border: 1px solid #d0d7e3; padding: 20px; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 10px 16px; border-radius: 4px; margin-bottom: 20px; font-size: 0.85em; }
  .danger  { background: #f8d7da; border: 1px solid #dc3545; padding: 10px 16px; border-radius: 4px; margin-bottom: 16px; }
  .success { background: #d4edda; border: 1px solid #28a745; padding: 14px 16px; border-radius: 4px; margin-bottom: 16px; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 8px; margin-top: 4px; margin-bottom: 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.95em; }
  button { background: #003366; color: white; padding: 10px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 0.95em; }
  button.rot { background: #dc3545; }
  button:hover { opacity: 0.85; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 10px 12px; border: 1px solid #dde3ee; text-align: left; }
  th { background: #003366; color: white; }
  tr:nth-child(even) { background: #f0f4fa; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; font-size: 0.8em; font-weight: bold; }
  .badge-admin { background: #dc3545; color: white; }
  .badge-kunde { background: #003366; color: white; }
  .rot { color: #dc3545; font-weight: bold; }
  .gruen { color: #28a745; font-weight: bold; }
`;

function validationToggle() {
  const checked = inputValidation ? 'checked' : '';
  const label   = inputValidation
    ? '<span style="color:#90ee90;">🛡️ Input Validation: AN</span>'
    : '<span style="color:#ffaaaa;">⚠️ Input Validation: AUS</span>';
  return `<label style="cursor:pointer;margin-left:20px;font-size:0.85em;display:flex;align-items:center;gap:6px;">
    <input type="checkbox" ${checked} onchange="fetch('/toggle-validation').then(()=>location.reload())" style="width:auto;margin:0;">
    ${label}
  </label>`;
}

function navBar(user) {
  if (!user) return `<nav><span>🏦 DemoBank Online-Banking</span><div><a href="/login">Login</a></div></nav>`;
  if (user.role === 'Admin') {
    return `<nav><span>🏦 DemoBank Online-Banking</span><div style="display:flex;align-items:center;">
      <span>Eingeloggt als <strong>${user.username}</strong></span>
      <a href="/admin">Admin-Panel</a>
      <a href="/logout">Logout</a>
      ${validationToggle()}
    </div></nav>`;
  }
  return `<nav><span>🏦 DemoBank Online-Banking</span><div>
    Eingeloggt als <strong>${user.username}</strong>
    <a href="/dashboard">Dashboard</a>
    <a href="/ueberweisung">Überweisung</a>
    <a href="/support">Support</a>
    <a href="/logout">Logout</a>
  </div></nav>`;
}

// -------------------------------------------------------
// GET /toggle-validation
// -------------------------------------------------------
app.get('/toggle-validation', (req, res) => {
  inputValidation = !inputValidation;
  console.log(`[Demo] Input Validation: ${inputValidation ? 'AN' : 'AUS'}`);
  res.sendStatus(200);
});

// -------------------------------------------------------
// GET /login
// -------------------------------------------------------
app.get('/login', (req, res) => {
  const error = req.query.error ? '<div class="danger">Falscher Benutzername oder Passwort.</div>' : '';
  res.send(`<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Login – DemoBank</title><style>${css}</style></head>
<body>
  ${navBar(null)}
  <div class="card" style="max-width:420px;margin:0 auto;">
    <h1>Login</h1>
    ${error}
    <form method="POST" action="/login">
      <label>Benutzername:<br><input type="text" name="username" placeholder="z.B. alice" required></label>
      <label>Passwort:<br><input type="password" name="password" placeholder="Passwort" required></label>
      <button type="submit">Einloggen</button>
    </form>
    <hr style="margin:20px 0;">
    <p style="font-size:0.82em;color:#555;">
      <strong>Testkonten:</strong><br>
      admin / admin123 &nbsp;<span class="badge badge-admin">Admin</span><br>
      alice / passwort123 &nbsp;<span class="badge badge-kunde">Kundin</span><br>
      bob / sicher456 &nbsp;<span class="badge badge-kunde">Kunde</span>
    </p>
  </div>
</body></html>`);
});

// -------------------------------------------------------
// POST /login
// -------------------------------------------------------
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS[username];
  if (!user || user.password !== password) return res.redirect('/login?error=1');
  const token = generateToken(username);
  res.cookie('session', token, { httpOnly: false, sameSite: 'Lax' });
  console.log(`[Login] ${username} eingeloggt. Token: ${token}`);
  res.redirect(user.role === 'Admin' ? '/admin' : '/dashboard');
});

// -------------------------------------------------------
// GET /logout
// -------------------------------------------------------
app.get('/logout', (req, res) => {
  const token = req.cookies.session;
  if (token) delete sessions[token];
  res.clearCookie('session');
  res.redirect('/login');
});

// -------------------------------------------------------
// GET /dashboard  (nur Kunden)
// -------------------------------------------------------
app.get('/dashboard', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login');
  if (user.role === 'Admin') return res.redirect('/admin');

  // Transaktionen dieses Nutzers — VULNERABILITY: Verwendungszweck ohne Escaping
  const meineTrans = transaktionen.filter(t => t.von === user.username || t.an === user.username);
  let transHtml = meineTrans.length === 0
    ? '<tr><td colspan="4"><em>Keine Transaktionen vorhanden.</em></td></tr>'
    : meineTrans.slice().reverse().map(t => {
        const ausgehend = t.von === user.username;
        const betragHtml = ausgehend
          ? `<span class="rot">-${formatEuro(t.betrag)}</span>`
          : `<span class="gruen">+${formatEuro(t.betrag)}</span>`;
        const gegenseite = ausgehend ? (t.anName || t.an) : t.von;
        return `<tr>
          <td>${t.timestamp}</td>
          <td>${gegenseite}</td>
          <td>${safeRender(t.verwendungszweck)}</td>
          <td>${betragHtml}</td>
        </tr>`;  // VULNERABILITY: verwendungszweck direkt gerendert (wenn Validation AUS)
      }).join('');

  res.send(`<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Dashboard – DemoBank</title><style>${css}</style></head>
<body>
  ${navBar(user)}

  <div class="warning">
    ⚠️ <strong>Labor 8 – Verteilte Systeme:</strong> Absichtlich unsichere Demo-Anwendung.
  </div>

  <h1>Mein Konto</h1>

  <div class="card">
    <h2>Kontodaten</h2>
    <table>
      <tr><th>Benutzername</th><td>${user.username}</td></tr>
      <tr><th>IBAN</th><td><code>${user.iban}</code></td></tr>
      <tr><th>Kontostand</th><td><strong style="font-size:1.2em;">${formatEuro(USERS[user.username].kontostand)}</strong></td></tr>
      <tr><th>Session-Token</th><td><code style="font-size:0.78em;color:#888;">${req.cookies.session}</code></td></tr>
    </table>
  </div>

  <div class="card">
    <h2>Transaktionshistorie</h2>
    <table>
      <tr><th>Zeit</th><th>Gegenseite</th><th>Verwendungszweck</th><th>Betrag</th></tr>
      ${transHtml}
    </table>
  </div>
</body></html>`);
});

// -------------------------------------------------------
// GET /ueberweisung  (nur Kunden)
// -------------------------------------------------------
app.get('/ueberweisung', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login');
  if (user.role === 'Admin') return res.redirect('/admin');

  const msg = req.query.ok
    ? `<div class="success">✓ Überweisung über ${req.query.ok} erfolgreich.</div>`
    : req.query.fehler
    ? `<div class="danger">✗ ${req.query.fehler}</div>`
    : '';

  res.send(`<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Überweisung – DemoBank</title><style>${css}</style></head>
<body>
  ${navBar(user)}
  <h1>Überweisung</h1>
  <p>Verfügbares Guthaben: <strong>${formatEuro(USERS[user.username].kontostand)}</strong></p>

  ${msg}

  <div class="card">
    <h2>Neue Überweisung</h2>
    <form method="POST" action="/ueberweisung">
      <label>Empfänger IBAN:<br><input type="text" name="iban" placeholder="DE27 2005 0550 1234 5678 90" required></label>
      <label>Empfänger Name:<br><input type="text" name="empfaenger" placeholder="Max Mustermann" required></label>
      <label>Betrag (€):<br><input type="number" name="betrag" min="0.01" step="0.01" placeholder="0.01" required></label>
      <label>Verwendungszweck:<br><input type="text" name="verwendungszweck" placeholder="Verwendungszweck" required></label>
      <button type="submit">Jetzt überweisen</button>
    </form>
  </div>
</body></html>`);
});

// -------------------------------------------------------
// POST /ueberweisung
// -------------------------------------------------------
app.post('/ueberweisung', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login');

  const { iban, empfaenger, betrag, verwendungszweck } = req.body;
  const betragNum = parseFloat(betrag);

  if (inputValidation && containsXSS(verwendungszweck)) {
    logXSS(user.username, 'Verwendungszweck', verwendungszweck);
    return res.redirect('/ueberweisung?fehler=XSS-Angriff+erkannt+und+blockiert');
  }

  if (isNaN(betragNum) || betragNum <= 0)
    return res.redirect('/ueberweisung?fehler=Ungültiger+Betrag');
  if (USERS[user.username].kontostand < betragNum)
    return res.redirect('/ueberweisung?fehler=Nicht+genügend+Guthaben');

  USERS[user.username].kontostand -= betragNum;

  // Empfänger gutschreiben falls interner Account
  const empfaengerUser = Object.keys(USERS).find(u => USERS[u].iban === iban);
  if (empfaengerUser) USERS[empfaengerUser].kontostand += betragNum;

  transaktionen.push({
    von: user.username,
    an: empfaengerUser || empfaenger,  // interner Username wenn vorhanden
    anName: empfaenger,
    iban,
    betrag: betragNum,
    verwendungszweck,  // VULNERABILITY: ohne Escaping gespeichert
    timestamp: new Date().toLocaleString('de-DE'),
  });

  console.log(`[Überweisung] ${user.username} → ${empfaenger} (${iban}): ${formatEuro(betragNum)} | Zweck: ${verwendungszweck}`);
  res.redirect(`/ueberweisung?ok=${formatEuro(betragNum)}`);
});

// -------------------------------------------------------
// GET /support  (nur Kunden)
// -------------------------------------------------------
app.get('/support', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login');
  if (user.role === 'Admin') return res.redirect('/admin');

  const meineAnfragen = supportAnfragen.filter(a => a.von === user.username);
  const anfragenHtml = meineAnfragen.length === 0
    ? '<p><em>Noch keine Anfragen gesendet.</em></p>'
    : meineAnfragen.slice().reverse().map(a => `
      <div class="card">
        <strong>${safeRender(a.betreff)}</strong> &nbsp; <small style="color:#888;">${a.timestamp}</small>
        <p style="white-space:pre-wrap;">${safeRender(a.nachricht)}</p>
        ${a.antwort
          ? `<div class="success"><strong>Antwort vom Support:</strong><br>${a.antwort}</div>`
          : '<div class="warning">⏳ Noch keine Antwort vom Support.</div>'
        }
      </div>`).join('');

  const msg = req.query.ok
    ? '<div class="success">✓ Anfrage erfolgreich gesendet.</div>'
    : req.query.fehler
    ? `<div class="danger">🛡️ ${req.query.fehler}</div>`
    : '';

  res.send(`<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Support – DemoBank</title><style>${css}</style></head>
<body>
  ${navBar(user)}
  <h1>Support</h1>
  ${msg}
  <div class="card">
    <h2>Neue Anfrage</h2>
    <form method="POST" action="/support">
      <label>Betreff:<br><input type="text" name="betreff" placeholder="z.B. Passwort vergessen" required></label>
      <label>Nachricht:<br><textarea name="nachricht" rows="5" placeholder="Beschreibe dein Anliegen…" required></textarea></label>
      <button type="submit">Anfrage senden</button>
    </form>
  </div>
  <div class="card">
    <h2>Meine Anfragen</h2>
    ${anfragenHtml}
  </div>
</body></html>`);
});

// -------------------------------------------------------
// POST /support
// -------------------------------------------------------
app.post('/support', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login');

  const { betreff, nachricht } = req.body;

  if (inputValidation && containsXSS(betreff)) {
    logXSS(user.username, 'Support-Betreff', betreff);
    return res.redirect('/support?fehler=XSS-Angriff+erkannt+und+blockiert');
  }
  if (inputValidation && containsXSS(nachricht)) {
    logXSS(user.username, 'Support-Nachricht', nachricht);
    return res.redirect('/support?fehler=XSS-Angriff+erkannt+und+blockiert');
  }

  supportAnfragen.push({
    id: Date.now(),
    von: user.username,
    betreff,
    nachricht,  // VULNERABILITY: ohne Escaping gespeichert und gerendert
    timestamp: new Date().toLocaleString('de-DE'),
    antwort: null,
  });

  console.log(`[Support] ${user.username}: ${betreff}`);
  res.redirect('/support?ok=1');
});

// -------------------------------------------------------
// POST /admin/reply
// -------------------------------------------------------
app.post('/admin/reply', (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== 'Admin') return res.redirect('/login');

  const { id, antwort } = req.body;
  const anfrage = supportAnfragen.find(a => a.id === parseInt(id));
  if (anfrage) {
    anfrage.antwort = antwort;
    console.log(`[Admin] Antwort auf Anfrage von ${anfrage.von}: ${antwort}`);
  }
  res.redirect('/admin');
});

// -------------------------------------------------------
// GET /admin  (nur Admin)
// -------------------------------------------------------
app.get('/admin', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login');
  if (user.role !== 'Admin') return res.redirect('/dashboard');

  const userRows = Object.keys(USERS).filter(u => u !== 'admin').map(u => `
    <tr>
      <td>${u}</td>
      <td><span class="badge badge-kunde">${USERS[u].role}</span></td>
      <td><code style="font-size:0.85em;">${USERS[u].iban}</code></td>
      <td>${USERS[u].kontostand !== null ? formatEuro(USERS[u].kontostand) : '—'}</td>
      <td>
        <form method="POST" action="/admin/delete" style="display:inline;">
          <input type="hidden" name="username" value="${u}">
          <button class="rot" type="submit" style="padding:4px 12px;font-size:0.85em;">Löschen</button>
        </form>
      </td>
    </tr>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><title>Admin – DemoBank</title><style>${css}</style></head>
<body>
  ${navBar(user)}
  <h1>Admin-Panel</h1>

  <div class="card">
    <h2>Benutzerverwaltung</h2>
    <table>
      <tr><th>Benutzername</th><th>Rolle</th><th>IBAN</th><th>Kontostand</th><th>Aktion</th></tr>
      ${userRows}
    </table>
  </div>

  <div class="card">
    <h2>Alle Transaktionen</h2>
    ${transaktionen.length === 0 ? '<p><em>Keine Transaktionen.</em></p>' : `
    <table>
      <tr><th>Zeit</th><th>Von</th><th>An</th><th>Betrag</th><th>Verwendungszweck</th></tr>
      ${transaktionen.slice().reverse().map(t => `
        <tr>
          <td>${t.timestamp}</td>
          <td>${t.von}</td>
          <td>${t.an}</td>
          <td>${formatEuro(t.betrag)}</td>
          <td>${safeRender(t.verwendungszweck)}</td>
        </tr>`).join('')}
    </table>`}
  </div>

  <div class="card">
    <h2>Support-Anfragen</h2>
    ${supportAnfragen.length === 0 ? '<p><em>Keine Anfragen vorhanden.</em></p>' : supportAnfragen.slice().reverse().map(a => `
    <div style="border:1px solid #d0d7e3;border-radius:6px;padding:16px;margin-bottom:12px;background:white;">
      <strong>Von: ${a.von}</strong> &nbsp; <small style="color:#888;">${a.timestamp}</small><br>
      <strong>Betreff:</strong> ${safeRender(a.betreff)}<br><br>
      <div style="background:#f8f9fa;padding:10px;border-radius:4px;margin-bottom:10px;">${safeRender(a.nachricht)}</div>
      ${a.antwort
        ? `<div class="success"><strong>Geantwortet:</strong> ${a.antwort}</div>`
        : `<form method="POST" action="/admin/reply" style="margin-top:8px;">
            <input type="hidden" name="id" value="${a.id}">
            <label>Antwort an ${a.von}:<br>
              <textarea name="antwort" rows="3" placeholder="z.B. Neues Passwort: …"></textarea>
            </label>
            <button type="submit">Antworten</button>
          </form>`
      }
    </div>`).join('')}
  </div>

  <div class="card">
    <h2>🛡️ Erkannte XSS-Angriffe</h2>
    ${xssAngriffe.length === 0
      ? '<p><em>Keine Angriffe erkannt.</em></p>'
      : `<table>
          <tr><th>Zeit</th><th>Benutzer</th><th>Feld</th><th>Payload</th></tr>
          ${xssAngriffe.slice().reverse().map(a => `
          <tr>
            <td>${a.timestamp}</td>
            <td>${a.von}</td>
            <td>${a.feld}</td>
            <td><code style="font-size:0.8em;word-break:break-all;">${a.payload.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></td>
          </tr>`).join('')}
        </table>`
    }
  </div>

  <div class="warning">
    ⚠️ <strong>Labor 8:</strong> Der Admin hat kein eigenes Konto — nur Verwaltungsfunktionen.
  </div>
</body></html>`);
});

// -------------------------------------------------------
// POST /admin/delete
// -------------------------------------------------------
app.post('/admin/delete', (req, res) => {
  const user = getUser(req);
  if (!user || user.role !== 'Admin') return res.redirect('/login');
  const { username } = req.body;
  if (username && USERS[username] && username !== 'admin') {
    delete USERS[username];
    console.log(`[Admin] User "${username}" gelöscht.`);
  }
  res.redirect('/admin');
});

// -------------------------------------------------------
// GET /
// -------------------------------------------------------
app.get('/', (req, res) => {
  const user = getUser(req);
  if (!user) return res.redirect('/login');
  res.redirect(user.role === 'Admin' ? '/admin' : '/dashboard');
});

app.listen(PORT, () => {
  console.log(`[DemoBank] läuft auf http://localhost:${PORT}`);
});
