#!/usr/bin/env bash
# Verifica el requisito "misma clave + mismo body => se ejecuta una vez, ambas
# respuestas identicas, incluso en paralelo".
#
#   ./scripts/prueba-idempotencia.sh                       # local
#   ./scripts/prueba-idempotencia.sh https://reto-geest-api-uh5j.onrender.com
    # produccion
set -euo pipefail

B="${1:-http://localhost:3000}"
RONDAS="${2:-5}"
PARALELAS=8
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

echo "Probando idempotencia contra $B"
for r in $(seq 1 "$RONDAS"); do
  S=$(date +%s%N); K="idem-$S"
  BODY="{\"name\":\"Par\",\"lastName\":\"Alelo\",\"email\":\"idem.$S@example.com\"}"

  for n in $(seq 1 $PARALELAS); do
    curl -s -X POST "$B/users" -H 'Content-Type: application/json' \
      -H "Idempotency-Key: $K" -d "$BODY" > "$TMP/r$n.txt" &
  done
  wait

  DISTINTAS=$(sort -u "$TMP"/r*.txt | wc -l | tr -d ' ')
  CREADOS=$(curl -s "$B/users" | python3 -c \
    "import json,sys;print(sum(1 for u in json.load(sys.stdin) if u['email']=='idem.$S@example.com'))")

  if [ "$CREADOS" = "1" ] && [ "$DISTINTAS" = "1" ]; then
    echo "  ronda $r: OK - 1 usuario creado, $PARALELAS respuestas identicas byte a byte"
  else
    echo "  ronda $r: FALLO - creados=$CREADOS respuestas_distintas=$DISTINTAS"
    sort -u "$TMP"/r*.txt; exit 1
  fi
done
echo "Todas las rondas correctas."

chmod +x scripts/prueba-idempotencia.sh
