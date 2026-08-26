#!/usr/bin/env bash
# Crea un conjunto de datos de ejemplo a traves de la API publica, para que
# quien revise el proyecto encuentre algo real en cada endpoint.
#
# Usa la API, no la base: asi el flujo se ejerce de verdad y la tarea que se
# archiva genera su notificacion como lo haria en uso normal.
#
#   ./scripts/sembrar-demo.sh
#   ./scripts/sembrar-demo.sh https://reto-geest-api-uh5j.onrender.com
set -euo pipefail

B="${1:-http://localhost:3000}"
id(){ python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])'; }

crear_usuario(){
  curl -s -X POST "$B/users" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$1\",\"lastName\":\"$2\",\"email\":\"$3\"}" | id
}
crear_tarea(){
  curl -s -X POST "$B/tasks" -H 'Content-Type: application/json' -d "$1" | id
}

echo "Sembrando datos de ejemplo en $B"

RICARDO=$(crear_usuario "Ricardo" "Mino"     "ricardo.mino@ejemplo.com")
CARMEN=$(crear_usuario  "Carmen"  "Martinez" "carmen.martinez@ejemplo.com")
ANTONIO=$(crear_usuario "Antonio" "Vazquez"  "antonio.vazquez@ejemplo.com")
MARIA=$(crear_usuario   "Maria"   "Marquez"  "maria.marquez@ejemplo.com")
echo "  usuarios: Ricardo=$RICARDO Carmen=$CARMEN Antonio=$ANTONIO Maria=$MARIA"

# 1) Tarea a medias: Ricardo ya firmo, Carmen no. Sigue abierta.
T1=$(crear_tarea '{"title":"Preparar el informe trimestral","description":"Incluir los anexos de ventas y el resumen ejecutivo."}')
curl -s -X POST "$B/tasks/$T1/assign" -H 'Content-Type: application/json' \
  -d "{\"userIds\":[$RICARDO,$CARMEN]}" > /dev/null
curl -s -X POST "$B/tasks/$T1/complete" -H 'Content-Type: application/json' \
  -d "{\"userId\":$RICARDO}" > /dev/null
echo "  tarea $T1: abierta, 1 de 2 completada"

# 2) Tarea completa: los cuatro firman, se archiva y dispara la notificacion.
T2=$(crear_tarea '{"title":"Revisar el contrato con el proveedor","description":"Requiere el visto bueno de las cuatro areas."}')
curl -s -X POST "$B/tasks/$T2/assign" -H 'Content-Type: application/json' \
  -d "{\"userIds\":[$RICARDO,$CARMEN,$ANTONIO,$MARIA]}" > /dev/null
for U in $RICARDO $CARMEN $ANTONIO $MARIA; do
  curl -s -X POST "$B/tasks/$T2/complete" -H 'Content-Type: application/json' \
    -d "{\"userId\":$U}" > /dev/null
done
echo "  tarea $T2: archivada, notificacion generada"

# 3) Tarea sin asignar: muestra el estado inicial.
T3=$(crear_tarea '{"title":"Actualizar la documentacion interna"}')
echo "  tarea $T3: abierta, sin asignados"

echo ""
echo "Comprueba la entrega de la notificacion en unos segundos:"
echo "  curl -s $B/tasks/$T2/notifications | python3 -m json.tool"