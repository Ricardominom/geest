import 'reflect-metadata';
import { createApp } from './app';
import { AppDataSource } from './db/data-source';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  console.log('[db] conexion establecida');

  createApp().listen(env.port, () => {
    console.log(`[http] escuchando en el puerto ${env.port} (${env.nodeEnv})`);
  });
}

bootstrap().catch((error) => {
  console.error('[app] fallo el arranque:', error);
  process.exit(1);
});