#!/usr/bin/env bash
# Provoca un archivado y muestra el historial de entrega de su notificacion.
# Necesita la API corriendo y un receptor escuchando en NOTIFY_URL.
#
#   ./scripts/demo-notificaciones.sh
#   ./scripts/demo-notificaciones.sh https://tu-api.com
set -euo pipefail

B="${1:-http://localhost:3000}"
S=$(date +%s)
id(){ python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])'; }

if ! curl -sf -o /dev/null "$B/health"; then
  echo "ERROR: la API no responde en $B"
  echo "       arrancala con 'pnpm dev' en otra terminal."
  exit 1
fi

U=$(curl -s -X POST "$B/users" -H 'Content-Type: application/json' \
      -d "{\"name\":\"Demo\",\"lastName\":\"Notif\",\"email\":\"notif.$S@example.com\"}" | id)
T=$(curl -s -X POST "$B/tasks" -H 'Content-Type: application/json' \
      -d "{\"title\":\"Notif demo $S\"}" | id)
curl -s -X POST "$B/tasks/$T/assign" -H 'Content-Type: application/json' \
      -d "{\"userIds\":[$U]}" > /dev/null

echo "usuario=$U  tarea=$T"
echo "--- completando (archiva y escribe en el outbox) ---"
curl -s -X POST "$B/tasks/$T/complete" -H 'Content-Type: application/json' \
      -d "{\"userId\":$U}"
echo ""

echo "--- esperando al despachador (max 120 s) ---"
for _ in $(seq 1 120); do
  RESP=$(curl -s "$B/tasks/$T/notifications" || true)
  case "$RESP" in
    '')                      ;;   # la API esta caida: seguimos esperando a que vuelva
    *'"status":"pending"'*)   ;;   # sigue pendiente
    *) break ;;
  esac
  sleep 1
done

FINAL=$(curl -s "$B/tasks/$T/notifications" || true)
if [ -z "$FINAL" ]; then
  echo "La API no responde. Arrancala y consulta:"
  echo "  curl -s $B/tasks/$T/notifications | python3 -m json.tool"
  exit 1
fi

python3 - "$FINAL" <<'PY'
import json, sys
from datetime import datetime

n = json.loads(sys.argv[1])["notifications"][0]
print("")
print("estado: %s   intentos: %s" % (n["status"], n["attempts"]))
if n["lastError"]:
    print("ultimo error: %s" % n["lastError"])
print("historial de entrega:")
prev = None
for a in n["deliveryAttempts"]:
    t = datetime.fromisoformat(a["at"].replace("Z", "+00:00"))
    gap = "  (+%.1fs)" % (t - prev).total_seconds() if prev else ""
    estado = a["httpStatus"] if a["httpStatus"] is not None else "sin respuesta"
    print("  intento %s: %s%s" % (a["attempt"], estado, gap))
    prev = t

if all(a["httpStatus"] is None for a in n["deliveryAttempts"]):
    print("")
    print("AVISO: ningun intento obtuvo respuesta HTTP.")
    print("       parece que no hay receptor escuchando en NOTIFY_URL;")
    print("       arrancalo con 'pnpm receptor' en otra terminal.")
PY

chmod +x scripts/demo-notificaciones.sh