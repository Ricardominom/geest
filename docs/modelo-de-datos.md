# Modelo de datos

Diagrama entidad-relacion de la base.
```mermaid
erDiagram
    users ||--o{ task_assignments : "firma"
    tasks ||--o{ task_assignments : "requiere"
    tasks ||--o{ notifications : "genera al archivarse"
    notifications ||--o{ notification_attempts : "registra"

    users {
        integer id PK "serial"
        varchar(120) name "obligatorio"
        varchar(120) last_name "obligatorio"
        varchar(254) email UK "unico por lower(email)"
        timestamptz created_at "default now()"
    }

    tasks {
        integer id PK "serial"
        varchar(200) title "obligatorio"
        text description "opcional"
        varchar(20) status "open | archived - CHECK"
        timestamptz archived_at "null mientras este abierta"
        timestamptz created_at "default now()"
        timestamptz updated_at "default now()"
    }

    task_assignments {
        integer task_id PK,FK "tasks.id, ON DELETE CASCADE"
        integer user_id PK,FK "users.id, ON DELETE CASCADE"
        boolean completed "default false"
        timestamptz completed_at "null hasta completar"
        timestamptz assigned_at "default now()"
    }

    notifications {
        bigint id PK "bigserial"
        integer task_id FK "-> tasks.id  ON DELETE CASCADE"
        varchar(50) event_type "task.archived"
        json payload "taskId, title, archivedAt"
        varchar(20) status "pending | sent | failed - CHECK"
        integer attempts "default 0"
        timestamptz next_attempt_at "cuando toca el siguiente intento"
        text last_error "null si nunca fallo"
        timestamptz created_at "default now()"
        timestamptz sent_at "null hasta entregarse"
    }

    notification_attempts {
        bigint id PK "bigserial"
        bigint notification_id FK "-> notifications.id  ON DELETE CASCADE"
        integer attempt_number "1, 2, 3"
        integer http_status "null si no hubo respuesta"
        text error "null si fue exitoso"
        integer duration_ms "cuanto tardo el POST"
        timestamptz attempted_at "default now()"
    }

    idempotency_keys {
        bigint id PK "bigserial"
        varchar(255) key UK "la genera el cliente"
        varchar(255) endpoint "metodo + ruta"
        char(64) request_hash "sha256 del cuerpo canonicalizado"
        varchar(20) status "in_progress | completed - CHECK"
        integer response_status "codigo HTTP guardado"
        json response_body "respuesta literal a reproducir"
        timestamptz created_at "default now()"
        timestamptz completed_at "null mientras este en curso"
    }
```

El esquema completo, con todos los tipos y restricciones, esta en
[db/schema.sql](../db/schema.sql), generado desde las migraciones con
`pnpm schema:dump`.

## Indices

| Indice | Tabla | Para que |
|---|---|---|
| `uq_users_email` | users | UNIQUE sobre `lower(email)`: hace imposible el duplicado por mayusculas |
| `idx_tasks_status` | tasks | `GET /tasks?status=...` filtra por aqui |
| `idx_task_assignments_user` | task_assignments | `GET /users/:id/tasks` busca por usuario, no por tarea |
| `uq_idempotency_keys_key` | idempotency_keys | UNIQUE: el que hace atomica la reserva de clave |
| `idx_idempotency_keys_created` | idempotency_keys | la purga de claves vencidas |
| `uq_notifications_task_event` | notifications | UNIQUE (task_id, event_type): una notificacion por tarea, garantizado |
| `idx_notifications_pendientes` | notifications | **parcial**: (next_attempt_at) WHERE status = 'pending' |
| `uq_attempts_notification_number` | notification_attempts | evita registrar dos veces el mismo intento |

## Decisiones y por que

**Clave primaria compuesta en `task_assignments`.**
La PK es (task_id, user_id). Eso hace **estructuralmente imposible** asignar dos
veces al mismo usuario en la misma tarea, sin depender de que la aplicacion se
acuerde de comprobarlo. Es lo que permite que `POST /assign` use
ON CONFLICT DO NOTHING y sea idempotente sin escribir logica.

**El `status` de la tarea es un dato derivado.**
Una tarea esta archivada cuando ninguna de sus filas en `task_assignments` tiene
completed = false. Se guarda igualmente en `tasks.status` porque
`GET /tasks?status=` necesita filtrar de forma barata, pero nunca se edita a
mano: solo lo escribe `completeTaskPart`, dentro de la transaccion que toma el
lock de la tarea.

**Indice parcial en `notifications`.**
El despachador solo consulta pendientes. Un indice sobre toda la tabla creceria
con miles de filas `sent` que nunca se leen. El plan de ejecucion confirma que
se usa (Index Scan using idx_notifications_pendientes), y el Index Cond ni
siquiera menciona `status`: el indice ya solo contiene pendientes.

**`json` y no `jsonb`.**
`jsonb` normaliza: descarta espacios y reordena las claves. Para idempotencia el
requisito es devolver una respuesta *identica*, y nunca consultamos dentro del
cuerpo guardado, asi que la unica propiedad que importa es justo la que `jsonb`
destruye. Lo mismo aplica al `payload` de las notificaciones.

**ON DELETE CASCADE en todas las claves foraneas.**
Borrar una tarea se lleva sus asignaciones, sus notificaciones y los intentos de
esas notificaciones. No quedan huerfanos que nadie sabria interpretar.

**`http_status` es nullable.**
Un servicio caido no devuelve codigo HTTP. NULL significa "no hubo respuesta" y
es distinto de un 500, donde el receptor contesto pero con error. Esa distincion
se ve en `GET /tasks/:idTask/notifications`.
