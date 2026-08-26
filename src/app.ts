import express, { Application } from 'express';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ name: 'Reto GEEST API', version: '1.0.0' });
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}