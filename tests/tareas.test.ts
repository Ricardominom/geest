import request from 'supertest';
import {
  app, asignar, completar, crearTarea, crearUsuario, tareaConAsignados,
} from './helpers';

describe('POST /tasks', () => {
  it('crea una tarea abierta con la descripcion opcional en null', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Preparar informe' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      title: 'Preparar informe',
      description: null,
      status: 'open',
      archivedAt: null,
    });
  });

  it('acepta descripcion cuando se envia', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Con detalle', description: 'Incluye los anexos' });

    expect(res.status).toBe(201);
    expect(res.body.description).toBe('Incluye los anexos');
  });

  it('exige el titulo', async () => {
    const res = await request(app).post('/tasks').send({ description: 'solo descripcion' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /tasks/:idTask/assign', () => {
  it('asigna varios usuarios de una vez', async () => {
    const ana = await crearUsuario();
    const luis = await crearUsuario();
    const tarea = await crearTarea();

    const res = await request(app)
      .post(`/tasks/${tarea.id}/assign`)
      .send({ userIds: [ana.id, luis.id] });

    expect(res.status).toBe(200);
    expect(res.body.assigned.sort()).toEqual([ana.id, luis.id].sort());
    expect(res.body.alreadyAssigned).toEqual([]);
  });

  it('no duplica la relacion al asignar dos veces', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);
    const ids = usuarios.map((u) => u.id);

    const res = await request(app).post(`/tasks/${tarea.id}/assign`).send({ userIds: ids });

    expect(res.status).toBe(200);
    expect(res.body.assigned).toEqual([]);
    expect(res.body.alreadyAssigned.sort()).toEqual([...ids].sort());

    // Y la tarea sigue teniendo exactamente 2 asignados, no 4.
    const detalle = await request(app).get(`/tasks/${tarea.id}`);
    expect(detalle.body.assignees).toHaveLength(2);
  });

  it('ignora ids repetidos dentro de la misma peticion', async () => {
    const ana = await crearUsuario();
    const tarea = await crearTarea();

    const res = await request(app)
      .post(`/tasks/${tarea.id}/assign`)
      .send({ userIds: [ana.id, ana.id, ana.id] });

    expect(res.status).toBe(200);
    expect(res.body.assigned).toEqual([ana.id]);
  });

  it('devuelve 404 si la tarea no existe', async () => {
    const ana = await crearUsuario();
    const res = await request(app).post('/tasks/999999/assign').send({ userIds: [ana.id] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('devuelve 404 y nombra los usuarios que no existen', async () => {
    const tarea = await crearTarea();
    const res = await request(app)
      .post(`/tasks/${tarea.id}/assign`)
      .send({ userIds: [999998, 999999] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
    expect(res.body.error.message).toContain('999998');
  });

  it('no asigna a nadie si alguno de los usuarios no existe', async () => {
    const ana = await crearUsuario();
    const tarea = await crearTarea();

    await request(app).post(`/tasks/${tarea.id}/assign`).send({ userIds: [ana.id, 999999] });

    // La transaccion completa se revierte: ni siquiera Ana queda asignada.
    const detalle = await request(app).get(`/tasks/${tarea.id}`);
    expect(detalle.body.assignees).toEqual([]);
  });

  it('rechaza asignar a una tarea ya archivada', async () => {
    const { tarea, usuarios } = await tareaConAsignados(1);
    await completar(tarea.id, usuarios[0].id);
    const nuevo = await crearUsuario();

    const res = await request(app)
      .post(`/tasks/${tarea.id}/assign`)
      .send({ userIds: [nuevo.id] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TASK_ALREADY_ARCHIVED');
  });

  it('exige al menos un usuario', async () => {
    const tarea = await crearTarea();
    const res = await request(app).post(`/tasks/${tarea.id}/assign`).send({ userIds: [] });
    expect(res.status).toBe(400);
  });
});

describe('POST /tasks/:idTask/complete', () => {
  it('marca la parte del usuario sin archivar si quedan pendientes', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);

    const res = await completar(tarea.id, usuarios[0].id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      taskStatus: 'open',
      archived: false,
      pendingUsers: 1,
    });
  });

  it('archiva cuando todos han completado', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);

    await completar(tarea.id, usuarios[0].id);
    const res = await completar(tarea.id, usuarios[1].id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      taskStatus: 'archived',
      archived: true,
      pendingUsers: 0,
    });
  });

  it('completar dos veces no cambia nada (doble clic)', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);

    const primera = await completar(tarea.id, usuarios[0].id);
    const segunda = await completar(tarea.id, usuarios[0].id);

    expect(segunda.status).toBe(200);
    expect(segunda.body).toEqual(primera.body);

    // Y no cuenta como dos firmas: sigue faltando el otro usuario.
    const detalle = await request(app).get(`/tasks/${tarea.id}`);
    expect(detalle.body.progress).toEqual({ completed: 1, total: 2 });
    expect(detalle.body.status).toBe('open');
  });

  it('rechaza a un usuario que no esta asignado', async () => {
    const { tarea } = await tareaConAsignados(1);
    const ajeno = await crearUsuario();

    const res = await completar(tarea.id, ajeno.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_NOT_ASSIGNED');
  });

  it('devuelve 404 si la tarea no existe', async () => {
    const ana = await crearUsuario();
    const res = await completar(999999, ana.id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });

  it('devuelve 404 si el usuario no existe', async () => {
    const { tarea } = await tareaConAsignados(1);
    const res = await completar(tarea.id, 999999);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});

describe('GET /tasks', () => {
  it('muestra quien ha completado su parte', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);
    await completar(tarea.id, usuarios[0].id);

    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);

    const encontrada = res.body.find((t: { id: number }) => t.id === tarea.id);
    expect(encontrada.progress).toEqual({ completed: 1, total: 2 });

    const porUsuario = Object.fromEntries(
      encontrada.assignees.map((a: { userId: number }) => [a.userId, a]),
    );
    expect(porUsuario[usuarios[0].id].completed).toBe(true);
    expect(porUsuario[usuarios[1].id].completed).toBe(false);
  });

  it('filtra por status=open y status=archived', async () => {
    const abierta = await tareaConAsignados(2, 'Sigue abierta');
    const cerrada = await tareaConAsignados(1, 'Ya cerrada');
    await completar(cerrada.tarea.id, cerrada.usuarios[0].id);

    const abiertas = await request(app).get('/tasks?status=open');
    const archivadas = await request(app).get('/tasks?status=archived');

    expect(abiertas.body.map((t: { id: number }) => t.id)).toEqual([abierta.tarea.id]);
    expect(archivadas.body.map((t: { id: number }) => t.id)).toEqual([cerrada.tarea.id]);
  });

  it('rechaza un status que no existe', async () => {
    const res = await request(app).get('/tasks?status=pendiente');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /tasks/:idTask', () => {
  it('devuelve la tarea con sus asignados y el estado de cada uno', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2, 'Con detalle');
    await completar(tarea.id, usuarios[0].id);

    const res = await request(app).get(`/tasks/${tarea.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: tarea.id, title: 'Con detalle', status: 'open' });
    expect(res.body.assignees).toHaveLength(2);
    expect(res.body.assignees[0]).toHaveProperty('email');
  });

  it('devuelve 404 si no existe', async () => {
    const res = await request(app).get('/tasks/999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });
});

describe('rutas inexistentes', () => {
  it('devuelven el formato de error acordado', async () => {
    const res = await request(app).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});