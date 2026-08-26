import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`La variable ${name} debe ser numerica, se recibio: ${raw}`);
  }
  return parsed;
}

/**
 * En modo test se usa OTRA base: los tests truncan tablas y jamas deben tocar
 * la de produccion. Si TEST_DATABASE_URL falta, required() lanza y el test no
 * corre; nunca cae de vuelta en DATABASE_URL.
 */
function resolverBaseDeDatos(): string {
  if (process.env.NODE_ENV !== 'test') {
    return required('DATABASE_URL');
  }
  const url = required('TEST_DATABASE_URL');
  if (/supabase|render|neon|amazonaws/i.test(url)) {
    throw new Error(
      'TEST_DATABASE_URL apunta a una base remota. Los tests truncan tablas: usa una base local.',
    );
  }
  return url;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 3000),
  databaseUrl: resolverBaseDeDatos(),
  notifyUrl: process.env.NOTIFY_URL ?? '',
  notifyTimeoutMs: num('NOTIFY_TIMEOUT_MS', 5000),
  notifyMaxAttempts: num('NOTIFY_MAX_ATTEMPTS', 3),
  notifyPollMs: num('NOTIFY_POLL_MS', 1000),
  notifyBackoffMs: num('NOTIFY_BACKOFF_MS', 2000),
};