import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();

/** Contador global: garantiza correos unicos aunque el TRUNCATE reinicie ids. */
let contador = 0;

export async function crearUsuario(
  datos: Partial<{ name: string; lastName: string; email: string }> = {},
) {
  contador += 1;
  const res = await request(app).post('/users').send({
    name: datos.name ?? `Usuario${contador}`,
    lastName: datos.lastName ?? 'Prueba',
    email: datos.email ?? `usuario${contador}@example.com`,
  });
  if (res.status !== 201) {
    throw new Error(`No se pudo crear el usuario: ${JSON.stringify(res.body)}`);
  }
  return res.body as { id: number; name: string; lastName: string; email: string };
}

export async function crearTarea(title = 'Tarea de prueba', description?: string) {
  const body = description === undefined ? { title } : { title, description };
  const res = await request(app).post('/tasks').send(body);
  if (res.status !== 201) {
    throw new Error(`No se pudo crear la tarea: ${JSON.stringify(res.body)}`);
  }
  return res.body as { id: number; title: string; status: string };
}

export async function asignar(taskId: number, userIds: number[]) {
  const res = await request(app).post(`/tasks/${taskId}/assign`).send({ userIds });
  if (res.status !== 200) {
    throw new Error(`No se pudo asignar: ${JSON.stringify(res.body)}`);
  }
  return res.body as { assigned: number[]; alreadyAssigned: number[] };
}

export function completar(taskId: number, userId: number) {
  return request(app).post(`/tasks/${taskId}/complete`).send({ userId });
}

/** Monta una tarea con N asignados, que es el escenario base de casi todo. */
export async function tareaConAsignados(cuantos: number, title = 'Tarea compartida') {
  const usuarios = [];
  for (let i = 0; i < cuantos; i += 1) usuarios.push(await crearUsuario());
  const tarea = await crearTarea(title);
  await asignar(tarea.id, usuarios.map((u) => u.id));
  return { tarea, usuarios };
}