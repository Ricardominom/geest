import request from 'supertest';
import { app, crearTarea, crearUsuario, tareaConAsignados } from './helpers';

const cuerpoUsuario = { name: 'Ana', lastName: 'Perez', email: 'ana@example.com' };

describe('Idempotency-Key: peticiones repetidas', () => {
  it('sin cabecera, dos peticiones identicas crean dos recursos', async () => {
    const a = await request(app).post('/tasks').send({ title: 'Duplicable' });
    const b = await request(app).post('/tasks').send({ title: 'Duplicable' });

    expect(a.body.id).not.toBe(b.body.id);
  });

  it('con la misma clave, se ejecuta una sola vez', async () => {
    const primera = await request(app)
      .post('/users').set('Idempotency-Key', 'k1').send(cuerpoUsuario);
    const segunda = await request(app)
      .post('/users').set('Idempotency-Key', 'k1').send(cuerpoUsuario);

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(201);
    expect(segunda.body.id).toBe(primera.body.id);

    const lista = await request(app).get('/users');
    expect(lista.body).toHaveLength(1);
  });

  it('la respuesta reproducida es identica byte a byte', async () => {
    const primera = await request(app)
      .post('/users').set('Idempotency-Key', 'k2').send(cuerpoUsuario);
    const segunda = await request(app)
      .post('/users').set('Idempotency-Key', 'k2').send(cuerpoUsuario);

    // No basta con que sea el mismo objeto: el reto pide respuestas identicas.
    expect(segunda.text).toBe(primera.text);
  });

  it('el orden de las claves del JSON no cambia la identidad de la peticion', async () => {
    const primera = await request(app)
      .post('/users').set('Idempotency-Key', 'k3')
      .send({ name: 'Ana', lastName: 'Perez', email: 'ana@example.com' });
    const segunda = await request(app)
      .post('/users').set('Idempotency-Key', 'k3')
      .send({ email: 'ana@example.com', lastName: 'Perez', name: 'Ana' });

    expect(segunda.body.id).toBe(primera.body.id);
  });

  it('reproduce tambien las respuestas de error', async () => {
    const primera = await request(app)
      .post('/tasks/999999/complete').set('Idempotency-Key', 'k4').send({ userId: 1 });
    const segunda = await request(app)
      .post('/tasks/999999/complete').set('Idempotency-Key', 'k4').send({ userId: 1 });

    expect(primera.status).toBe(404);
    expect(segunda.status).toBe(404);
    expect(segunda.text).toBe(primera.text);
  });

  it('rechaza reusar la clave con un cuerpo distinto', async () => {
    await request(app).post('/users').set('Idempotency-Key', 'k5').send(cuerpoUsuario);

    const res = await request(app)
      .post('/users').set('Idempotency-Key', 'k5')
      .send({ name: 'Otro', lastName: 'Distinto', email: 'otro@example.com' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rechaza reusar la clave en otro endpoint', async () => {
    await request(app).post('/users').set('Idempotency-Key', 'k6').send(cuerpoUsuario);

    const res = await request(app)
      .post('/tasks').set('Idempotency-Key', 'k6').send({ title: 'Otra cosa' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('claves distintas son peticiones distintas', async () => {
    const a = await request(app)
      .post('/tasks').set('Idempotency-Key', 'k7-a').send({ title: 'Igual' });
    const b = await request(app)
      .post('/tasks').set('Idempotency-Key', 'k7-b').send({ title: 'Igual' });

    expect(b.body.id).not.toBe(a.body.id);
  });

  it('funciona tambien en assign y complete', async () => {
    const { tarea, usuarios } = await tareaConAsignados(2);

    const a = await request(app)
      .post(`/tasks/${tarea.id}/complete`).set('Idempotency-Key', 'k8')
      .send({ userId: usuarios[0].id });
    const b = await request(app)
      .post(`/tasks/${tarea.id}/complete`).set('Idempotency-Key', 'k8')
      .send({ userId: usuarios[0].id });

    expect(b.text).toBe(a.text);
  });
});

describe('Idempotency-Key: peticiones EN PARALELO', () => {
  it('ocho peticiones simultaneas con la misma clave crean un solo usuario', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).post('/users').set('Idempotency-Key', 'par-1').send(cuerpoUsuario),
      ),
    );

    // Todas responden 201 con el mismo cuerpo, byte a byte.
    for (const res of respuestas) {
      expect(res.status).toBe(201);
      expect(res.text).toBe(respuestas[0].text);
    }

    const lista = await request(app).get('/users');
    expect(lista.body).toHaveLength(1);
  });

  it('en paralelo sobre /tasks tampoco duplica', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 6 }, () =>
        request(app).post('/tasks').set('Idempotency-Key', 'par-2').send({ title: 'Unica' }),
      ),
    );

    const ids = new Set(respuestas.map((r) => r.body.id));
    expect(ids.size).toBe(1);

    const tareas = await request(app).get('/tasks');
    expect(tareas.body).toHaveLength(1);
  });
});