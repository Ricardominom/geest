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
    const task = await manager.findOne(Task, { where: { id: taskId } });
    if (!task) {
      throw AppError.notFound('TASK_NOT_FOUND', `No existe la tarea con id ${taskId}.`);
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