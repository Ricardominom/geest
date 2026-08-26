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

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 3000),
  databaseUrl: required('DATABASE_URL'),
  notifyUrl: process.env.NOTIFY_URL ?? '',
  notifyTimeoutMs: num('NOTIFY_TIMEOUT_MS', 5000),
  notifyMaxAttempts: num('NOTIFY_MAX_ATTEMPTS', 3),
  notifyPollMs: num('NOTIFY_POLL_MS', 1000),
  notifyBackoffMs: num('NOTIFY_BACKOFF_MS', 2000),
};