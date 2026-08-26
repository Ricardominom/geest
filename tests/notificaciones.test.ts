import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { env } from '../src/config/env';
import { despacharPendientes } from '../src/services/notifications.dispatcher';
import { app, completar, tareaConAsignados } from './helpers';

let servidor: Server;
let recibidas: Array<Record<string, unknown>> = [];
let fallarLasPrimeras = 0;
let codigoDeFallo = 503;

const urlOriginal = env.notifyUrl;
const backoffOriginal = env.notifyBackoffMs;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lanza ciclos de despacho hasta que la notificacion deje de estar pendiente. */
async function despacharHasta(veces: number): Promise<void> {
  for (let i = 0; i < veces; i += 1) {
    await despacharPendientes();
    await dormir(env.notifyBackoffMs * 2 ** i + 20);
  }
}

beforeAll(async () => {
  // Receptor de prueba en un puerto efimero: mas fiable que fijar uno.
  servidor = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (trozo) => { cuerpo += trozo; });
    req.on('end', () => {
      recibidas.push(JSON.parse(cuerpo || '{}'));
      if (recibidas.length <= fallarLasPrimeras) {
        res.writeHead(codigoDeFallo).end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      }
    });
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));

  const { port } = servidor.address() as AddressInfo;
  // Apuntamos el despachador al receptor de prueba y acortamos el backoff
  // para que los reintentos no tarden segundos reales.
  env.notifyUrl = `http://127.0.0.1:${port}/webhook`;
  env.notifyBackoffMs = 10;
});

afterAll(async () => {
  env.notifyUrl = urlOriginal;
  env.notifyBackoffMs = backoffOriginal;
  await new Promise<void>((r) => servidor.close(() => r()));
});

beforeEach(() => {
  recibidas = [];
  fallarLasPrimeras = 0;
  codigoDeFallo = 503;
});

async function archivarUnaTarea() {
  const { tarea, usuarios } = await tareaConAsignados(1, 'Tarea a notificar');
  await completar(tarea.id, usuarios[0].id);
  return tarea;
}

describe('outbox: la notificacion se escribe al archivar', () => {
  it('queda pendiente, con el payload que pide el reto y sin intentos', async () => {
    const tarea = await archivarUnaTarea();

    const res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);

    const n = res.body.notifications[0];
    expect(n.status).toBe('pending');
    expect(n.attempts).toBe(0);
    expect(n.deliveryAttempts).toEqual([]);
    expect(n.payload).toEqual({
      taskId: tarea.id,
      title: 'Tarea a notificar',
      archivedAt: expect.any(String),
    });
  });

  it('una tarea sin archivar no tiene notificaciones', async () => {
    const { tarea } = await tareaConAsignados(2);
    const res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    expect(res.body.notifications).toEqual([]);
  });

  it('devuelve 404 si la tarea no existe', async () => {
    const res = await request(app).get('/tasks/999999/notifications');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TASK_NOT_FOUND');
  });
});

describe('entrega y reintentos', () => {
  it('entrega al primer intento cuando el receptor responde 200', async () => {
    const tarea = await archivarUnaTarea();

    await despacharPendientes();

    expect(recibidas).toHaveLength(1);
    expect(recibidas[0]).toMatchObject({ taskId: tarea.id, title: 'Tarea a notificar' });

    const res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    const n = res.body.notifications[0];
    expect(n.status).toBe('sent');
    expect(n.attempts).toBe(1);
    expect(n.sentAt).not.toBeNull();
    expect(n.deliveryAttempts).toHaveLength(1);
    expect(n.deliveryAttempts[0].httpStatus).toBe(200);
  });

  it('reintenta ante 5xx y acaba entregando', async () => {
    fallarLasPrimeras = 2;
    const tarea = await archivarUnaTarea();

    await despacharHasta(3);

    const res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    const n = res.body.notifications[0];
    expect(n.status).toBe('sent');
    expect(n.attempts).toBe(3);
    expect(n.deliveryAttempts.map((a: { httpStatus: number }) => a.httpStatus))
      .toEqual([503, 503, 200]);
  });

  it('se rinde tras el maximo de intentos y guarda el ultimo error', async () => {
    fallarLasPrimeras = 99;
    const tarea = await archivarUnaTarea();

    await despacharHasta(4);

    const res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    const n = res.body.notifications[0];
    expect(n.status).toBe('failed');
    expect(n.attempts).toBe(env.notifyMaxAttempts);
    expect(n.deliveryAttempts).toHaveLength(env.notifyMaxAttempts);
    expect(n.lastError).toContain('503');
    expect(n.sentAt).toBeNull();
  });

  it('no reintenta ante un 4xx: el receptor rechaza, no esta caido', async () => {
    fallarLasPrimeras = 99;
    codigoDeFallo = 400;
    const tarea = await archivarUnaTarea();

    await despacharHasta(4);

    const res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    const n = res.body.notifications[0];
    expect(n.status).toBe('failed');
    expect(n.attempts).toBe(1);
    expect(recibidas).toHaveLength(1);
  });

  it('registra httpStatus null cuando el receptor no responde', async () => {
    const urlBuena = env.notifyUrl;
    env.notifyUrl = 'http://127.0.0.1:1/webhook'; // puerto cerrado
    const tarea = await archivarUnaTarea();

    await despacharHasta(4);
    env.notifyUrl = urlBuena;

    const res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    const n = res.body.notifications[0];
    expect(n.status).toBe('failed');
    expect(n.deliveryAttempts[0].httpStatus).toBeNull();
    expect(n.deliveryAttempts[0].error).toBeTruthy();
  });

  it('una notificacion ya enviada no se vuelve a enviar', async () => {
    await archivarUnaTarea();

    await despacharPendientes();
    await despacharPendientes();
    await despacharPendientes();

    expect(recibidas).toHaveLength(1);
  });

  it('no hay nada que despachar si no se ha archivado nada', async () => {
    await tareaConAsignados(2);
    expect(await despacharPendientes()).toBe(0);
    expect(recibidas).toHaveLength(0);
  });
});

describe('el outbox sobrevive al proceso', () => {
  it('una notificacion pendiente se entrega cuando el receptor vuelve', async () => {
    fallarLasPrimeras = 1;
    const tarea = await archivarUnaTarea();

    // Primer intento: falla. Nadie mas lo intenta todavia.
    await despacharPendientes();
    let res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    expect(res.body.notifications[0].status).toBe('pending');
    expect(res.body.notifications[0].attempts).toBe(1);

    // Aqui, en produccion, el proceso podria morir. El estado vive en la base:
    // otro ciclo (u otro proceso) retoma en el intento 2, no desde el 1.
    await dormir(env.notifyBackoffMs + 20);
    await despacharPendientes();

    res = await request(app).get(`/tasks/${tarea.id}/notifications`);
    expect(res.body.notifications[0].status).toBe('sent');
    expect(res.body.notifications[0].attempts).toBe(2);
  });
});