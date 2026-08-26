import 'reflect-metadata';
import { createApp } from './app';
import { AppDataSource } from './db/data-source';
import { env } from './config/env';
import { purgarClavesVencidas } from './middleware/idempotency';
import { iniciarDespachador } from './services/notifications.dispatcher';
import { log } from './utils/logger';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  log.info('[db] conexion establecida');

  createApp().listen(env.port, () => {
    log.info(`[http] escuchando en el puerto ${env.port} (${env.nodeEnv})`);
  });

  setInterval(() => {void purgarClavesVencidas(); }, 60 * 60 * 1000).unref();
  iniciarDespachador();
}

bootstrap().catch((error) => {
  log.error('[app] fallo el arranque:', error);
  process.exit(1);
});