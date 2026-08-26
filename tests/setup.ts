import 'reflect-metadata';
import { AppDataSource } from '../src/db/data-source';

/**
 * Orden inverso a las dependencias y CASCADE por si acaso.
 * RESTART IDENTITY reinicia las secuencias, para que los ids sean
 * predecibles en cada test.
 */
const TABLAS = [
  'notification_attempts',
  'notifications',
  'task_assignments',
  'idempotency_keys',
  'tasks',
  'users',
];

beforeAll(async () => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
});

beforeEach(async () => {
  await AppDataSource.query(
    `TRUNCATE TABLE ${TABLAS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});