import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { parseIdParam, parseQuery, validateBody } from '../middleware/validate';
import { TASK_STATUSES, TaskStatus } from '../entities/Task';
import { assignUsers, completeTaskPart, createTask, getTask, listTasks, listTaskNotifications } from '../services/tasks.service';
import { idempotency } from '../middleware/idempotency';

const createTaskSchema = z.object({
  title: z
    .string({ error: 'title es obligatorio y debe ser texto.' })
    .trim()
    .min(1, 'title no puede estar vacio.')
    .max(200, 'title no puede exceder 200 caracteres.'),
  description: z.string().trim().max(5000).nullish(),
});

const assignSchema = z.object({
  userIds: z
    .array(z.number().int().positive('Cada userId debe ser un entero positivo.'), {
      error: 'userIds es obligatorio y debe ser un arreglo de enteros.',
    })
    .min(1, 'userIds debe contener al menos un usuario.'),
});

const completeSchema = z.object({
  userId: z
    .number({ error: 'userId es obligatorio y debe ser un entero.' })
    .int('userId debe ser un entero.')
    .positive('userId debe ser un entero positivo.'),
});

const listTasksQuerySchema = z.object({
  status: z.enum(TASK_STATUSES as [TaskStatus, ...TaskStatus[]], { error: 'status solo admite los valores open o archived.'}).optional(),
});

export const tasksRouter = Router();

tasksRouter.post(
  '/tasks',
  validateBody(createTaskSchema),
  idempotency(),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createTask(req.body));
  }),
);

tasksRouter.post(
  '/tasks/:idTask/assign',
  validateBody(assignSchema),
  idempotency(),
  asyncHandler(async (req, res) => {
    const taskId = parseIdParam(req, 'idTask');
    res.status(200).json(await assignUsers(taskId, req.body.userIds));
  }),
);

tasksRouter.post(
  '/tasks/:idTask/complete',
  validateBody(completeSchema),
  idempotency(),
  asyncHandler(async (req, res) => {
    const taskId = parseIdParam(req, 'idTask');
    res.status(200).json(await completeTaskPart(taskId, req.body.userId));
  }),
);

tasksRouter.get(
  '/tasks',
  asyncHandler(async (req, res) => {
    const { status } = parseQuery(req, listTasksQuerySchema);
    res.status(200).json(await listTasks(status));
  }),
);

tasksRouter.get(
  '/tasks/:idTask',
  asyncHandler(async (req, res) => {
    const taskId = parseIdParam(req, 'idTask');
    res.status(200).json(await getTask(taskId));
  }),
);

tasksRouter.get(
  '/tasks/:idTask/notifications',
  asyncHandler(async (req, res) => {
    const taskId = parseIdParam(req, 'idTask');
    res.status(200).json(await listTaskNotifications(taskId));
  }),
);