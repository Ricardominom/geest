# Reto GEEST — API de tareas colaborativas

API REST para gestionar tareas asignadas a varias personas. Cada asignado marca su
parte; cuando **todos** terminan, la tarea se archiva sola y se notifica a un
sistema externo.

**API en vivo:** https://reto-geest-api-uh5j.onrender.com/health

| | |
|---|---|
| Stack | Node 22 · TypeScript 5.9 · Express 4 · PostgreSQL 16 · TypeORM · Zod |
| Despliegue | Render (Node nativo) + Supabase |
| Modelo de datos | [docs/modelo-de-datos.md](docs/modelo-de-datos.md) · [db/schema.sql](db/schema.sql) |

## Cómo ejecutarlo

Necesitas Node 20+, pnpm 11+ y PostgreSQL 16.

```bash
pnpm install
cp .env.example .env          # rellena DATABASE_URL
createdb reto_geest_test      # base para los tests
pnpm migration:run
pnpm dev                      # http://localhost:3000
```

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | sí | conexión a PostgreSQL |
| `TEST_DATABASE_URL` | para tests | base local; **nunca** remota |
| `NOTIFY_URL` | no | destino de las notificaciones |
| `NOTIFY_MAX_ATTEMPTS` · `NOTIFY_BACKOFF_MS` · `NOTIFY_POLL_MS` | no | 3 · 2000 · 1000 |
| `PORT` | no | 3000 |

## Tests

```bash
pnpm test              # 67 tests, ~4 segundos
```

Corren contra `TEST_DATABASE_URL`, que debe ser **local**: la suite trunca tablas
entre casos. Si falta, los tests fallan en vez de caer hacia `DATABASE_URL`.

Además hay scripts que demuestran las garantías contra la API ya desplegada, que
es algo que Postman no puede hacer porque envía las peticiones en fila:

```bash
./scripts/prueba-idempotencia.sh https://reto-geest-api-uh5j.onrender.com
./scripts/prueba-concurrencia.sh https://reto-geest-api-uh5j.onrender.com
```

## Endpoints

| Método | Ruta | |
|---|---|---|
| POST | `/users` | crea un usuario |
| GET | `/users` | usuarios y sus tareas pendientes |
| GET | `/users/:idUser/tasks` | tareas del usuario, completadas o no |
| POST | `/tasks` | crea una tarea (`open`) |
| POST | `/tasks/:idTask/assign` | asigna usuarios sin duplicar |
| POST | `/tasks/:idTask/complete` | marca una parte; archiva si es la última |
| GET | `/tasks?status=open\|archived` | tareas con quién completó su parte |
| GET | `/tasks/:idTask` | detalle con asignados y su estado |
| GET | `/tasks/:idTask/notifications` | intentos de entrega |

Todos los errores usan el mismo formato:

```json
{ "error": { "code": "TASK_NOT_FOUND", "message": "No existe la tarea con id 42." } }
```

## Confiabilidad

**Idempotencia.** Los POST aceptan `Idempotency-Key`. La clave se reserva con un
`INSERT ... ON CONFLICT DO NOTHING` sobre un índice único: una instrucción atómica,
sin hueco entre comprobar y actuar. La petición que llega tarde **espera** y
devuelve la misma respuesta que la primera, no un error.

**Archivado sin duplicados.** `completeTaskPart` toma `SELECT ... FOR UPDATE` sobre
la tarea antes de contar pendientes. Sin ese bloqueo, dos transacciones simultáneas
ven cada una una parte pendiente —la del otro, aún sin confirmar— y **ninguna
archiva**: la tarea queda completa y abierta para siempre, sin ningún error.

## Mejora extra: patrón Outbox

**Qué añade sobre lo pedido.** El enunciado ya exige reintentos y registro de
intentos, y eso se cumple con un reintento en memoria. Lo que esta mejora aporta es
la **durabilidad**: que la notificación no se pierda aunque el proceso muera entre
el archivado y el envío.

**El problema.** Archivar y avisar al sistema externo son escrituras en dos sistemas
distintos y no pueden hacerse atómicamente. Si aviso antes de confirmar y la
transacción revierte, avisé de algo que no ocurrió. Si aviso después y el proceso
muere, el aviso se pierde y nadie lo reintenta. Y reintentar en memoria no lo
arregla: la memoria no sobrevive a un reinicio, y en Render free el servicio se
suspende cada 15 minutos.

**La solución.** Al archivar, en la misma transacción, se inserta la *intención* de
notificar en la tabla `notifications`. Dos escrituras en la misma base: o se guardan
ambas o ninguna. Un despachador independiente lee esa tabla y envía, con esperas
crecientes hasta 3 intentos, registrando cada uno en `notification_attempts`.

**Por qué no una cola.** Redis o RabbitMQ **no resuelven el problema, lo mueven**:
escribir en la cola sigue siendo una segunda escritura fuera de la transacción.
Además añaden un servicio que desplegar y vigilar. Postgres ya da transacciones.

**Qué garantiza.** *At-least-once*, no *exactly-once*: si el receptor procesa el
aviso y se pierde la respuesta, se reintenta y le llega dos veces. Por eso el
payload lleva `taskId` — el receptor debe deduplicar.

## Decisiones técnicas

- **SQL directo en las rutas críticas.** El ORM se usa para el CRUD simple, pero
  `assign` y `complete` van en SQL explícito (`FOR UPDATE`, `ON CONFLICT`,
  `SKIP LOCKED`): ahí el control del bloqueo *es* la lógica, y ocultarlo tras una
  abstracción hace imposible razonar sobre la concurrencia.
- **Restricciones en la base, no en la aplicación.** PK compuesta en
  `task_assignments`, `UNIQUE` sobre `lower(email)`, `UNIQUE (task_id, event_type)`.
  Lo que la base impide no depende de que el código se acuerde de comprobarlo.
- **Migraciones, nunca `synchronize`**, que puede eliminar columnas en silencio al
  arrancar. El `db/schema.sql` se **genera** desde las migraciones
  (`pnpm schema:dump`) para que no puedan divergir.
- **`json` y no `jsonb`**: `jsonb` reordena las claves, y el requisito de
  idempotencia es devolver una respuesta *idéntica*.
- **pnpm con `minimumReleaseAge: 1440`** y scripts de instalación bloqueados: mitiga
  la ventana de exposición ante paquetes comprometidos.

## Supuestos

- Correo repetido devuelve `409`; los correos se tratan sin distinguir mayúsculas.
- Una tarea archivada no admite nuevas asignaciones (`409 TASK_ALREADY_ARCHIVED`).
- Completar dos veces devuelve `200` sin cambiar nada: es el doble clic, no un error.
- `Idempotency-Key` es opcional; sin ella todo se comporta como antes.
- Las claves de idempotencia caducan a las 24 h y se purgan solas.
- Un `4xx` del receptor no se reintenta: rechaza el mensaje, no está caído.
- El sistema externo debe deduplicar por `taskId` (at-least-once).

## Qué quedó fuera

- **Autenticación y autorización**: cualquiera puede completar la parte de otro. Es
  lo primero que haría falta en producción.
- **Paginación** en los listados.
- **Desasignar usuarios y reabrir tareas archivadas**: no estaban en el enunciado, y
  reabrir plantea qué hacer con la notificación ya enviada.
- **Observabilidad** más allá de logs, y **rate limiting**.
- **Despachador multi-instancia**: el código usa `SKIP LOCKED` y lo soportaría, pero
  solo está probado con una instancia.

## Dónde está desplegada y por qué

**Render** (runtime Node nativo) contra **Supabase** (PostgreSQL 16 gestionado).
Acceso: https://reto-geest-api-uh5j.onrender.com

Se descartó **Vercel** por arquitectura, no por preferencia: es serverless, cada
petición ejecuta una función que nace y muere, y el despachador de notificaciones
necesita un proceso vivo permanentemente. **Docker** sobraba porque Render compila y
ejecuta Node directamente, y un **VPS** exigía administrar sistema, certificados y
reinicios: trabajo ajeno al reto.

Render da HTTPS, despliegue automático desde GitHub y un proceso de larga vida con
coste cero. Su limitación —suspende el servicio tras 15 minutos, con un arranque de
~50 segundos— se mitiga con un keep-alive en GitHub Actions cada 10 minutos y un
monitor externo cada 5.
