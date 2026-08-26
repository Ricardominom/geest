#!/usr/bin/env bash
# Demuestra el requisito "archivada exactamente una vez": crea una tarea con
# dos asignados y lanza los dos /complete SIMULTANEAMENTE, varias veces.
#
#   ./scripts/prueba-concurrencia.sh                       # contra local
#   ./scripts/prueba-concurrencia.sh https://tu-api.com    # contra produccion
set -euo pipefail

B="${1:-http://localhost:3000}"
RONDAS="${2:-5}"
id(){ python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))"; }

echo "Probando contra $B"
for r in $(seq 1 "$RONDAS"); do
  STAMP=$(date +%s%N)
  A=$(curl -s -X POST "$B/users" -H 'Content-Type: application/json' \
      -d "{\"name\":\"C\",\"lastName\":\"A\",\"email\":\"conc.a.$STAMP@example.com\"}" | id)
  L=$(curl -s -X POST "$B/users" -H 'Content-Type: application/json' \
      -d "{\"name\":\"C\",\"lastName\":\"B\",\"email\":\"conc.b.$STAMP@example.com\"}" | id)
  T=$(curl -s -X POST "$B/tasks" -H 'Content-Type: application/json' \
      -d "{\"title\":\"Concurrencia $STAMP\"}" | id)
  curl -s -X POST "$B/tasks/$T/assign" -H 'Content-Type: application/json' \
      -d "{\"userIds\":[$A,$L]}" > /dev/null

  # Los dos ultimos completan a la vez: aqui es donde se prueba el lock.
  curl -s -X POST "$B/tasks/$T/complete" -H 'Content-Type: application/json' -d "{\"userId\":$A}" > /tmp/c1.json &
  curl -s -X POST "$B/tasks/$T/complete" -H 'Content-Type: application/json' -d "{\"userId\":$L}" > /tmp/c2.json &
  wait

  ARCHIVADORES=$(cat /tmp/c1.json /tmp/c2.json | grep -c '"archived":true' || true)
  ESTADO=$(curl -s "$B/tasks/$T" | python3 -c "import json,sys;print(json.load(sys.stdin)['status'])")

  if [ "$ARCHIVADORES" -eq 1 ] && [ "$ESTADO" = "archived" ]; then
    echo "  ronda $r: OK - archivada exactamente una vez"
  else
    echo "  ronda $r: FALLO - archivadores=$ARCHIVADORES estado=$ESTADO"
    exit 1
  fi
done
echo "Todas las rondas correctas."