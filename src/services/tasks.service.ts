import { AppDataSource } from '../db/data-source';
import { Task, TaskStatus } from '../entities/Task';
import { AppError } from '../errors/AppError';
import { rows } from '../db/raw';

export interface CreateTaskInput {
  title: string;
  description?: string | null;
}

export async function createTask(input: CreateTaskInput) {
  const repo = AppDataSource.getRepository(Task);
  const task = await repo.save(
    repo.create({
      title: input.title,
      description: input.description?.trim() || null,
      status: 'open',
    }),
  );

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    archivedAt: task.archivedAt,
    createdAt: task.createdAt,
  };
}

export async function assignUsers(taskId: number, userIds: number[]) {
  const uniqueIds = [...new Set(userIds)];

  return AppDataSource.transaction(async (manager) => {
    const tareas = rows<{ id: number; status: TaskStatus }>(
      await manager.query(
        `SELECT "id", "status" FROM "tasks" WHERE "id" = $1 FOR UPDATE`,
        [taskId],
      ),
    );

    if (tareas.length === 0) {
      throw AppError.notFound('TASK_NOT_FOUND', `No existe la tarea con id ${taskId}.`);
    }

    if (tareas[0].status === 'archived') {
      throw AppError.conflict(
        'TASK_ALREADY_ARCHIVED',
        `La tarea ${taskId} ya esta archivada y no admite nuevas asignaciones.`,
      );
    }

    const existentes = rows<{ id: number }>(
      await manager.query(`SELECT "id" FROM "users" WHERE "id" = ANY($1::int[])`, [uniqueIds]),
    );

    if (existentes.length !== uniqueIds.length) {
      const encontrados = new Set(existentes.map((u) => u.id));
      const faltantes = uniqueIds.filter((id) => !encontrados.has(id));
      throw AppError.notFound(
        'USER_NOT_FOUND',
        `No existen los siguientes usuarios: ${faltantes.join(', ')}.`,
      );
    }

    const insertados = rows<{ user_id: number }>(
      await manager.query(
        `INSERT INTO "task_assignments" ("task_id", "user_id")
         SELECT $1, unnest($2::int[])
         ON CONFLICT DO NOTHING
         RETURNING "user_id"`,
        [taskId, uniqueIds],
      ),
    );

    const nuevos = insertados.map((r) => r.user_id);
    const nuevosSet = new Set(nuevos);

    return {
      message: 'Usuarios asignados correctamente.',
      taskId,
      assigned: nuevos,
      alreadyAssigned: uniqueIds.filter((id) => !nuevosSet.has(id)),
    };
  });
}

interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  archived_at: Date | null;
  created_at: Date;
}

async function attachAssignees(tareas: TaskRow[]) {
  if (tareas.length === 0) return [];
  const ids = tareas.map((t) => t.id);

  const asignaciones = rows<{
    task_id: number; user_id: number; name: string; last_name: string;
    email: string; completed: boolean; completed_at: Date | null;
  }>(
    await AppDataSource.query(
      `SELECT a."task_id", u."id" AS user_id, u."name", u."last_name", u."email",
              a."completed", a."completed_at"
       FROM "task_assignments" a
       JOIN "users" u ON u."id" = a."user_id"
       WHERE a."task_id" = ANY($1::int[])
       ORDER BY u."id" ASC`,
      [ids],
    ),
  );

  const porTarea = new Map<number, Array<Record<string, unknown>>>();
  for (const row of asignaciones) {
    const lista = porTarea.get(row.task_id) ?? [];
    lista.push({
      userId: row.user_id,
      name: row.name,
      lastName: row.last_name,
      email: row.email,
      completed: row.completed,
      completedAt: row.completed_at,
    });
    porTarea.set(row.task_id, lista);
  }

  return tareas.map((t) => {
    const assignees = porTarea.get(t.id) ?? [];
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      archivedAt: t.archived_at,
      createdAt: t.created_at,
      progress: {
        completed: assignees.filter((a) => a.completed === true).length,
        total: assignees.length,
      },
      assignees,
    };
  });
}

export async function listTasks(status?: TaskStatus) {
  const result = status
    ? await AppDataSource.query(
        `SELECT "id","title","description","status","archived_at","created_at"
         FROM "tasks" WHERE "status" = $1 ORDER BY "id" ASC`,
        [status],
      )
    : await AppDataSource.query(
        `SELECT "id","title","description","status","archived_at","created_at"
         FROM "tasks" ORDER BY "id" ASC`,
      );

  return attachAssignees(rows<TaskRow>(result));
}

export async function getTask(taskId: number) {
  const encontradas = rows<TaskRow>(
    await AppDataSource.query(
      `SELECT "id","title","description","status","archived_at","created_at"
       FROM "tasks" WHERE "id" = $1`,
      [taskId],
    ),
  );

  if (encontradas.length === 0) {
    throw AppError.notFound('TASK_NOT_FOUND', `No existe la tarea con id ${taskId}.`);
  }

  const [task] = await attachAssignees(encontradas);
  return task;
}

export interface CompleteResult {
  message: string;
  taskId: number;
  userId: number;
  taskStatus: TaskStatus;
  archived: boolean;
  pendingUsers: number;
}

export async function completeTaskPart(taskId: number, userId: number): Promise<CompleteResult> {
  return AppDataSource.transaction(async (manager) => {
    const tareas = rows<{ id: number; title: string; status: TaskStatus }>(
      await manager.query(
        `SELECT "id", "title", "status" FROM "tasks" WHERE "id" = $1 FOR UPDATE`,
        [taskId],
      ),
    );

    if (tareas.length === 0) {
      throw AppError.notFound('TASK_NOT_FOUND', `No existe la tarea con id ${taskId}.`);
    }
    const task = tareas[0];

    const usuarios = rows<{ id: number }>(
      await manager.query(`SELECT "id" FROM "users" WHERE "id" = $1`, [userId]),
    );
    if (usuarios.length === 0) {
      throw AppError.notFound('USER_NOT_FOUND', `No existe el usuario con id ${userId}.`);
    }

    const asignacion = rows<{ completed: boolean }>(
      await manager.query(
        `SELECT "completed" FROM "task_assignments" WHERE "task_id" = $1 AND "user_id" = $2`,
        [taskId, userId],
      ),
    );
    if (asignacion.length === 0) {
      throw AppError.conflict(
        'USER_NOT_ASSIGNED',
        `El usuario ${userId} no esta asignado a la tarea ${taskId}.`,
      );
    }

    if (!asignacion[0].completed) {
      await manager.query(
        `UPDATE "task_assignments" SET "completed" = true, "completed_at" = now()
         WHERE "task_id" = $1 AND "user_id" = $2`,
        [taskId, userId],
      );
    }

    const pendientes = rows<{ n: number }>(
      await manager.query(
        `SELECT count(*)::int AS n FROM "task_assignments"
         WHERE "task_id" = $1 AND "completed" = false`,
        [taskId],
      ),
    )[0].n;

    let status: TaskStatus = task.status;
    if (pendientes === 0 && task.status === 'open') {
      const archivada = rows<{ archived_at: Date }>(
        await manager.query(
          `UPDATE "tasks" SET "status" = 'archived', "archived_at" = now(), "updated_at" = now()
           WHERE "id" = $1
           RETURNING "archived_at"`,
          [taskId],
        ),
      )[0];
      status = 'archived';

      await manager.query(
        `INSERT INTO "notifications" ("task_id", "event_type", "payload")
         VALUES ($1, 'task.archived', $2::json)
         ON CONFLICT ("task_id", "event_type") DO NOTHING`,
        [
          taskId,
          JSON.stringify({
            taskId,
            title: task.title,
            archivedAt: archivada.archived_at.toISOString(),
          }),
        ],
      );
    }

    return {
      message: 'Parte de la tarea completada.',
      taskId,
      userId,
      taskStatus: status,
      archived: status === 'archived',
      pendingUsers: pendientes,
    };
  });
}

export async function listTaskNotifications(taskId: number) {
  const existe = rows<{ id: number }>(
    await AppDataSource.query(`SELECT "id" FROM "tasks" WHERE "id" = $1`, [taskId]),
  );
  if (existe.length === 0) {
    throw AppError.notFound('TASK_NOT_FOUND', `No existe la tarea con id ${taskId}.`);
  }

  type NotifRow = {
    id: string; event_type: string; payload: unknown; status: string;
    attempts: number; next_attempt_at: Date; last_error: string | null;
    created_at: Date; sent_at: Date | null;
  };

  const notificaciones = rows<NotifRow>(
    await AppDataSource.query(
      `SELECT "id", "event_type", "payload", "status", "attempts",
              "next_attempt_at", "last_error", "created_at", "sent_at"
         FROM "notifications" WHERE "task_id" = $1 ORDER BY "id" ASC`,
      [taskId],
    ),
  );

  if (notificaciones.length === 0) {
    return { taskId, notifications: [] };
  }

  type AttemptRow = {
    notification_id: string; attempt_number: number; http_status: number | null;
    error: string | null; duration_ms: number; attempted_at: Date;
  };

  // Una sola consulta para todos los intentos y union en memoria, en lugar de
  // una consulta por notificacion (N+1).
  const intentos = rows<AttemptRow>(
    await AppDataSource.query(
      `SELECT "notification_id", "attempt_number", "http_status",
              "error", "duration_ms", "attempted_at"
         FROM "notification_attempts"
        WHERE "notification_id" = ANY($1::bigint[])
        ORDER BY "notification_id" ASC, "attempt_number" ASC`,
      [notificaciones.map((n) => n.id)],
    ),
  );

  const porNotificacion = new Map<string, AttemptRow[]>();
  for (const intento of intentos) {
    const clave = String(intento.notification_id);
    const lista = porNotificacion.get(clave) ?? [];
    lista.push(intento);
    porNotificacion.set(clave, lista);
  }

  return {
    taskId,
    notifications: notificaciones.map((n) => ({
      id: n.id,
      eventType: n.event_type,
      payload: n.payload,
      status: n.status,
      attempts: n.attempts,
      nextAttemptAt: n.status === 'pending' ? n.next_attempt_at : null,
      lastError: n.last_error,
      createdAt: n.created_at,
      sentAt: n.sent_at,
      deliveryAttempts: (porNotificacion.get(String(n.id)) ?? []).map((a) => ({
        attempt: a.attempt_number,
        httpStatus: a.http_status,
        error: a.error,
        durationMs: a.duration_ms,
        at: a.attempted_at,
      })),
    })),
  };
}