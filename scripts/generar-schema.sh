#!/usr/bin/env bash
# Genera db/schema.sql a partir de una base creada por las migraciones.
# El esquema NO se escribe a mano: se deriva de las migraciones, para que no
# puedan divergir. Filtra las lineas que pg_dump varia en cada ejecucion
# (\restrict con hash aleatorio, version de pg_dump), de modo que el archivo
# solo cambie cuando cambie el esquema de verdad.
#
#   pnpm schema:dump
set -euo pipefail

BASE="${1:-reto_geest_test}"
SALIDA="db/schema.sql"
mkdir -p db

{
  echo "-- Esquema de la base de datos - Reto tecnico GEEST"
  echo "--"
  echo "-- GENERADO AUTOMATICAMENTE. No editar a mano."
  echo "-- Fuente: las migraciones de src/migrations aplicadas sobre una base vacia."
  echo "-- Regenerar con:  pnpm schema:dump"
  echo ""
  pg_dump --schema-only --no-owner --no-privileges "$BASE" \
    | grep -v -E '^\\(un)?restrict' \
    | grep -v -E '^-- Dumped (from|by)' \
    | cat -s
} > "$SALIDA"

echo "generado $SALIDA ($(wc -l < "$SALIDA" | tr -d ' ') lineas)"