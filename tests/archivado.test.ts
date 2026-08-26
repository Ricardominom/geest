import request from 'supertest';
import { AppDataSource } from '../src/db/data-source';
import { app, completar, tareaConAsignados } from './helpers';

async function contarNotificaciones(taskId: number): Promise<number> {
  const filas = await AppDataSource.query(
    `SELECT count(*)::int AS n FROM "notifications" WHERE "task_id" = $1`,
    [taskId],
  );
  return filas[0].n;
}

describe('archivado sin duplicados', () => {
  it('los dos ultimos usuarios completando a la vez archivan exactamente una vez', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);

    const [a, b] = await Promise.all([
      completar(tarea.id, usuarios[0].id),
      completar(tarea.id, usuarios[1].id),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    // Exactamente uno de los dos reporta haber archivado.
    const archivadores = [a, b].filter((r) => r.body.archived === true);
    expect(archivadores).toHaveLength(1);

    const detalle = await request(app).get(`/tasks/${tarea.id}`);
    expect(detalle.body.status).toBe('archived');
    expect(detalle.body.progress).toEqual({ completed: 2, total: 2 });
  });

  it('genera una sola notificacion aunque completen a la vez', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);

    await Promise.all([
      completar(tarea.id, usuarios[0].id),
      completar(tarea.id, usuarios[1].id),
    ]);

    expect(await contarNotificaciones(tarea.id)).toBe(1);
  });

  it('aguanta con cinco usuarios completando simultaneamente', async () => {
    const { tarea, usuarios } = await tareaConAsignados(5);

    const respuestas = await Promise.all(
      usuarios.map((u) => completar(tarea.id, u.id)),
    );

    expect(respuestas.filter((r) => r.body.archived === true)).toHaveLength(1);
    expect(await contarNotificaciones(tarea.id)).toBe(1);
  });

  it('el doble clic simultaneo del mismo usuario no cuenta como dos firmas', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);

    await Promise.all([
      completar(tarea.id, usuarios[0].id),
      completar(tarea.id, usuarios[0].id),
    ]);

    const detalle = await request(app).get(`/tasks/${tarea.id}`);
    expect(detalle.body.progress).toEqual({ completed: 1, total: 2 });
    expect(detalle.body.status).toBe('open');
    expect(await contarNotificaciones(tarea.id)).toBe(0);
  });

  it('no crea notificacion si la tarea aun no se archiva', async () => {
    const { tarea, usuarios } = await tareaConAsignados(3);
    await completar(tarea.id, usuarios[0].id);

    expect(await contarNotificaciones(tarea.id)).toBe(0);
  });
});