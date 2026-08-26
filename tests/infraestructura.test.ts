import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';

const app = createApp();

describe('infraestructura de pruebas', () => {
  it('usa una base local, nunca la de produccion', () => {
    expect(env.databaseUrl).toContain('localhost');
    expect(env.databaseUrl).not.toMatch(/supabase|render|neon|amazonaws/i);
  });

  it('responde /health con la base conectada', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('cada test empieza con las tablas vacias', async () => {
    const res = await request(app).get('/users');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('el TRUNCATE reinicia los ids', async () => {
    const res = await request(app)
      .post('/users')
      .send({ name: 'Ana', lastName: 'Perez', email: 'ana@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });
});