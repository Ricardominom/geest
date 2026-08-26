import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler';
import { parseIdParam, validateBody } from '../middleware/validate';
import { createUser, listUserTasks, listUsers } from '../services/users.service';

const createUserSchema = z.object({
  name: z
    .string({ error: 'name es obligatorio y debe ser texto.' })
    .trim()
    .min(1, 'name no puede estar vacio.')
    .max(120, 'name no puede exceder 120 caracteres.'),
  lastName: z
    .string({ error: 'lastName es obligatorio y debe ser texto.' })
    .trim()
    .min(1, 'lastName no puede estar vacio.')
    .max(120, 'lastName no puede exceder 120 caracteres.'),
  email: z
    .string({ error: 'email es obligatorio y debe ser texto.' })
    .trim()
    .min(1, 'email no puede estar vacio.')
    .max(254, 'email no puede exceder 254 caracteres.')
    .email('El correo electronico no es valido.'),
});

export const usersRouter = Router();

usersRouter.post(
  '/users',
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createUser(req.body));
  }),
);

usersRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await listUsers());
  }),
);

usersRouter.get(
  '/users/:idUser/tasks',
  asyncHandler(async (req, res) => {
    const userId = parseIdParam(req, 'idUser');
    res.status(200).json(await listUserTasks(userId));
  }),
);