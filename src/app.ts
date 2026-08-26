import express, { Application } from 'express';
import { AppDataSource } from './db/data-source';
import { usersRouter } from './routes/users.routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/', (_req, res) => {
    res.json({ name: 'Reto GEEST API', version: '1.0.0' });
  });

  app.get('/health', async (_req, res) => {
    try {
      await AppDataSource.query('SELECT 1');
      res.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'No hay conexion con la base de datos.' },
      });
    }
  });

  app.use(usersRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}