import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { AppError } from '../errors/AppError';
import { isUniqueViolation } from '../db/pg-errors';

export interface CreateUserInput {
  name: string;
  lastName: string;
  email: string;
}

function serializeUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export async function createUser(input: CreateUserInput) {
  const repo = AppDataSource.getRepository(User);

  const user = repo.create({
    name: input.name,
    lastName: input.lastName,
    email: input.email.toLowerCase(),
  });

  try {
    return serializeUser(await repo.save(user));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese correo.');
    }
    throw error;
  }
}

export async function listUsers() {
  const users = await AppDataSource.getRepository(User).find({ order: { id: 'ASC' } });
  if (users.length === 0) return [];

  const pendientes: Array<{ user_id: number; id: number; title: string; status: string }> =
    await AppDataSource.query(`
      SELECT a."user_id", t."id", t."title", t."status"
      FROM "task_assignments" a
      JOIN "tasks" t ON t."id" = a."task_id"
      WHERE a."completed" = false
      ORDER BY t."id" ASC
    `);

  const porUsuario = new Map<number, Array<{ id: number; title: string; status: string }>>();
  for (const row of pendientes) {
    const lista = porUsuario.get(row.user_id) ?? [];
    lista.push({ id: row.id, title: row.title, status: row.status });
    porUsuario.set(row.user_id, lista);
  }

  return users.map((user) => ({
    ...serializeUser(user),
    pendingTasks: porUsuario.get(user.id) ?? [],
  }));
}

export async function listUserTasks(userId: number) {
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
  if (!user) {
    throw AppError.notFound('USER_NOT_FOUND', `No existe el usuario con id ${userId}.`);
  }

  const rows: Array<{
    id: number; title: string; description: string | null; status: string;
    archived_at: Date | null; completed: boolean; completed_at: Date | null;
  }> = await AppDataSource.query(
    `
    SELECT t."id", t."title", t."description", t."status", t."archived_at",
           a."completed", a."completed_at"
    FROM "task_assignments" a
    JOIN "tasks" t ON t."id" = a."task_id"
    WHERE a."user_id" = $1
    ORDER BY t."id" ASC
    `,
    [userId],
  );

  return {
    user: serializeUser(user),
    tasks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      archivedAt: row.archived_at,
      completedByUser: row.completed,
      completedAt: row.completed_at,
    })),
  };
}