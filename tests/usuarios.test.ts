import request from 'supertest';
import { app, asignar, crearTarea, crearUsuario, completar } from './helpers';

describe('POST /users', () => {
  it('crea un usuario y devuelve su id', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Ana', lastName: 'Perez', email: 'ana@example.com' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: 'Ana',
      lastName: 'Perez',
      email: 'ana@example.com',
    });
  });

  it('rechaza un correo con formato invalido', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Ana', lastName: 'Perez', email: 'no-es-un-correo' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza cuando falta informacion', async () => {
    const res = await request(app).post('/users').send({ name: 'Ana' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza campos vacios o solo espacios', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: '   ', lastName: 'Perez', email: 'x@example.com' });
    expect(res.status).toBe(400);
  });

  it('rechaza un correo repetido', async () => {
    await crearUsuario({ email: 'repetido@example.com' });
    const res = await request(app)
      .post('/users')
      .send({ name: 'Otro', lastName: 'Usuario', email: 'repetido@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('trata el correo como insensible a mayusculas', async () => {
    await crearUsuario({ email: 'ana@example.com' });
    const res = await request(app)
      .post('/users')
      .send({ name: 'Ana', lastName: 'Mayus', email: 'ANA@EXAMPLE.COM' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('guarda el correo normalizado en minusculas', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Ana', lastName: 'Perez', email: '  ANA@Example.COM  ' });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('ana@example.com');
  });

  it('devuelve el formato de error acordado', async () => {
    const res = await request(app).post('/users').send({});
    expect(res.body).toHaveProperty('error.code');
    expect(res.body).toHaveProperty('error.message');
    expect(typeof res.body.error.message).toBe('string');
  });
});

describe('GET /users', () => {
  it('devuelve una lista vacia cuando no hay usuarios', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('incluye las tareas pendientes de cada usuario', async () => {
    const ana = await crearUsuario({ name: 'Ana' });
    const luis = await crearUsuario({ name: 'Luis' });
    const tarea = await crearTarea('Informe trimestral');
    await asignar(tarea.id, [ana.id, luis.id]);
    await completar(tarea.id, ana.id);

    const res = await request(app).get('/users');
    expect(res.status).toBe(200);

    const anaEnLista = res.body.find((u: { id: number }) => u.id === ana.id);
    const luisEnLista = res.body.find((u: { id: number }) => u.id === luis.id);

    // Ana ya hizo su parte: la tarea deja de estar pendiente para ella.
    expect(anaEnLista.pendingTasks).toEqual([]);
    expect(luisEnLista.pendingTasks).toEqual([
      { id: tarea.id, title: 'Informe trimestral', status: 'open' },
    ]);
  });
});

describe('GET /users/:idUser/tasks', () => {
  it('marca si el usuario completo o no cada tarea', async () => {
    const ana = await crearUsuario();
    const hecha = await crearTarea('Ya la hice');
    const pendiente = await crearTarea('Aun no');
    await asignar(hecha.id, [ana.id]);
    await asignar(pendiente.id, [ana.id]);
    await completar(hecha.id, ana.id);

    const res = await request(app).get(`/users/${ana.id}/tasks`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(ana.id);

    const porId = Object.fromEntries(
      res.body.tasks.map((t: { id: number }) => [t.id, t]),
    );
    expect(porId[hecha.id].completedByUser).toBe(true);
    expect(porId[hecha.id].completedAt).not.toBeNull();
    expect(porId[pendiente.id].completedByUser).toBe(false);
    expect(porId[pendiente.id].completedAt).toBeNull();
  });

  it('devuelve 404 si el usuario no existe', async () => {
    const res = await request(app).get('/users/999999/tasks');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('rechaza un id que no es un entero positivo', async () => {
    const res = await request(app).get('/users/abc/tasks');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });
});