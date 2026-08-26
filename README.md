# Reto GEEST — API de tareas colaborativas

API REST para gestionar tareas asignadas a varias personas. Cada asignado marca
su parte; cuando **todos** terminan, la tarea se archiva sola y se notifica a un
sistema externo.

**API en vivo:** https://reto-geest-api-uh5j.onrender.com/health

| | |
|---|---|
| Stack | Node 22 · TypeScript 5.9 · Express 4 · PostgreSQL 16 · TypeORM · Zod |
| Base de datos | Supabase (PostgreSQL gestionado) |
| Despliegue | Render, runtime Node nativo |
| Gestor de paquetes | pnpm 11 |
| Modelo de datos | [docs/modelo-de-datos.md](docs/modelo-de-datos.md) · [db/schema.sql](db/schema.sql) |

## Cómo ejecutarlo en local

Necesitas Node 20+, pnpm 11+ y PostgreSQL 16.

```bash
pnpm install
cp .env.example .env          # rellena DATABASE_URL con tu Postgres
createdb reto_geest_test      # base para los tests
pnpm migration:run
pnpm dev                      # http://localhost:3000
```

Variables de entorno:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | sí | conexión a PostgreSQL |
| `TEST_DATABASE_URL` | solo para tests | base local; **nunca** una remota |
| `NOTIFY_URL` | no | destino de las notificaciones; sin ella el despachador no arranca |
| `NOTIFY_MAX_ATTEMPTS` | no | intentos de entrega (por defecto 3) |
| `NOTIFY_BACKOFF_MS` | no | espera base entre reintentos (2000) |
| `NOTIFY_POLL_MS` | no | cada cuánto revisa la bandeja de salida (1000) |
| `PORT` | no | 3000 |

## Tests

```bash
pnpm test              # 67 tests, ~4 segundos
pnpm test:coverage
```

Corren contra `TEST_DATABASE_URL`, que **debe ser local**: la suite trunca tablas
entre casos. Si esa variable falta, los tests fallan en vez de caer hacia
`DATABASE_URL` — un valor por defecto ahí sería el que un día borra producción.

Además hay scripts que verifican las garantías contra una API ya corriendo,
también en producción:

```bash
./scripts/prueba-idempotencia.sh https://reto-geest-api-uh5j.onrender.com
./scripts/prueba-concurrencia.sh https://reto-geest-api-uh5j.onrender.com
```

Lanzan 8 peticiones **simultáneas** con la misma clave y comprueban que se crea
un solo registro y que las 8 respuestas son idénticas byte a byte. Postman no
sirve para esto: envía las peticiones en fila y nunca provoca la carrera.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/users` | crea un usuario |
| GET | `/users` | usuarios con sus tareas pendientes |
| GET | `/users/:idUser/tasks` | tareas del usuario, con si completó su parte |
| POST | `/tasks` | crea una tarea (`open`) |
| POST | `/tasks/:idTask/assign` | asigna usuarios sin duplicar |
| POST | `/tasks/:idTask/complete` | marca la parte de un usuario; archiva si es el último |
| GET | `/tasks?status=open\|archived` | tareas con quién completó su parte |
| GET | `/tasks/:idTask` | detalle con asignados y su estado |
| GET | `/tasks/:idTask/notifications` | intentos de entrega de la notificación |

Todos los errores usan el mismo formato:

```json
{ "error": { "code": "TASK_NOT_FOUND", "message": "No existe la tarea con id 42." } }
```

## Las tres garantías

**Idempotencia.** Todos los POST aceptan la cabecera `Idempotency-Key`. La clave se
reserva con un `INSERT ... ON CONFLICT DO NOTHING` sobre un índice único: una sola
instrucción atómica, sin hueco entre comprobar y actuar. La petición que llega
tarde **espera** a que termine la primera y devuelve exactamente su respuesta, no
un error — el requisito es que ambas respuestas sean idénticas.

**Archivado sin duplicados.** `completeTaskPart` toma un `SELECT ... FOR UPDATE`
sobre la tarea antes de contar pendientes. Sin ese lock, en `READ COMMITTED` dos
transacciones simultáneas ven cada una un pendiente (la del otro, aún sin commit)
y **nadie archiva**: la tarea queda con todas las partes hechas y estado `open`
para siempre, en silencio. Con el lock, archiva exactamente uno.

**Notificaciones con reintentos.** Ver la mejora extra.

## Mejora extra: patrón Outbox

**El problema.** Archivar la tarea y avisar al sistema externo son escrituras en
dos sistemas distintos, y no pueden hacerse atómicamente. Si notificas antes del
commit y la transacción revierte, avisaste de algo que no ocurrió. Si notificas
después y el proceso muere, el aviso se pierde y nadie lo reintenta — porque el
que sabía ya no existe. Reintentar en memoria no lo arregla: la memoria no
sobrevive a un reinicio, y en Render free el servicio se suspende cada 15 minutos.

**La solución.** Al archivar, dentro de la misma transacción, se inserta la
*intención* de notificar en la tabla `notifications`. Dos escrituras en la misma
base: o se guardan ambas o ninguna. Un despachador independiente lee esa tabla y
hace los `POST`, con reintentos de espera creciente (2s, 4s) hasta 3 intentos, y
registra cada intento en `notification_attempts`.

**Por qué no una cola.** Redis o RabbitMQ **no resuelven el problema, lo mueven**:
escribir en la cola sigue siendo una segunda escritura fuera de tu transacción.
Además añaden un servicio que desplegar y vigilar, y no entran en el plan gratuito
de Render. Postgres ya te da transacciones.

**Qué garantiza.** *At-least-once*, no *exactly-once*. Si el receptor procesa el
aviso y la respuesta se pierde, el despachador reintenta y el receptor lo recibe
dos veces. Por eso el payload lleva `taskId`: el receptor debe ser idempotente.
Es el mismo problema que resuelve `Idempotency-Key`, visto desde el otro lado.

## Decisiones técnicas

- **SQL directo en las rutas críticas.** El ORM se usa para el CRUD simple, pero
  `assign` y `complete` van en SQL explícito: `FOR UPDATE`, `ON CONFLICT`,
  `SKIP LOCKED`. Ahí el control del bloqueo *es* la lógica, y ocultarlo tras una
  abstracción hace imposible razonar sobre la concurrencia.
- **Restricciones en la base, no en la aplicación.** PK compuesta en
  `task_assignments`, `UNIQUE` sobre `lower(email)`, `UNIQUE (task_id, event_type)`.
  Lo que la base impide no depende de que el código se acuerde de comprobarlo, y
  sobrevive a los bugs.
- **Migraciones, nunca `synchronize`.** `synchronize: true` puede eliminar columnas
  en silencio al arrancar. El esquema versionado en `db/schema.sql` se **genera**
  desde las migraciones (`pnpm schema:dump`) para que no puedan divergir.
- **`json` y no `jsonb`.** `jsonb` reordena las claves. Para reproducir una
  respuesta *idéntica* eso es justo lo que no queremos, y nunca consultamos dentro
  del cuerpo guardado.
- **pnpm con `minimumReleaseAge: 1440`.** No instala versiones publicadas hace menos
  de 24 horas y bloquea los scripts de instalación salvo autorización explícita.
  Mitiga la ventana de exposición de paquetes comprometidos.

## Supuestos

- Un correo repetido devuelve `409`; los correos se tratan sin distinguir mayúsculas.
- Una tarea archivada no admite nuevas asignaciones (`409 TASK_ALREADY_ARCHIVED`).
- Completar dos veces devuelve `200` sin cambiar nada: es el doble clic, no un error.
- `Idempotency-Key` es opcional; sin ella los endpoints se comportan como siempre.
- Las claves de idempotencia caducan a las 24 horas y se purgan automáticamente.
- Un `4xx` del receptor no se reintenta: rechaza el mensaje, no está caído. Solo se
  reintentan `5xx`, timeouts y errores de red.
- El sistema externo es responsable de deduplicar por `taskId` (at-least-once).

## Qué quedó fuera

- **Autenticación y autorización.** Cualquiera puede completar la parte de cualquiera.
  Es lo primero que haría falta en producción.
- **Paginación** en los listados. Con volumen real, `GET /tasks` no aguanta.
- **Desasignar usuarios y reabrir tareas archivadas.** No estaban en el enunciado y
  reabrir plantea qué hacer con la notificación ya enviada.
- **Observabilidad** más allá de logs: sin métricas ni trazas.
- **Rate limiting.**
- **Despachador multi-instancia.** El código usa `SKIP LOCKED` y lo soportaría, pero
  solo está probado con una instancia.
