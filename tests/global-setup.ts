import 'reflect-metadata';
import { AppDataSource } from '../src/db/data-source';

/**
 * Corre las migraciones sobre la base de pruebas antes de la primera suite.
 * Efecto lateral util: cada ejecucion verifica que las migraciones funcionan
 * de arriba abajo, algo que en produccion solo ocurre una vez.
 */
export default async function globalSetup(): Promise<void> {
  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();
}