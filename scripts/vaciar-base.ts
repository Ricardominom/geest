import 'reflect-metadata';
import { AppDataSource } from '../src/db/data-source';

/**
 * Borra TODOS los datos de dominio. Es destructivo, asi que exige una
 * confirmacion explicita por variable de entorno: nadie lo ejecuta por
 * accidente al recorrer el historial de la terminal.
 *
 *   CONFIRMAR=si pnpm vaciar
 *
 * Borra users y tasks; las asignaciones, notificaciones e intentos caen solos
 * por ON DELETE CASCADE. Tambien limpia las claves de idempotencia.
 */
async function main(): Promise<void> {
  if (process.env.CONFIRMAR !== 'si') {
    console.error('Este script borra TODOS los datos.');
    console.error('Si es lo que quieres:  CONFIRMAR=si pnpm vaciar');
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    const destino = AppDataSource.options.database ?? '(desconocida)';
    console.log(`vaciando: ${String(destino)}`);

    await AppDataSource.query(`DELETE FROM "idempotency_keys"`);
    await AppDataSource.query(`DELETE FROM "tasks"`);
    await AppDataSource.query(`DELETE FROM "users"`);

    // Reiniciar las secuencias: DELETE no las toca, y una demo que empieza en
    // el id 70 sugiere un historial que no existe.
    for (const secuencia of [
      'users_id_seq',
      'tasks_id_seq',
      'notifications_id_seq',
      'notification_attempts_id_seq',
      'idempotency_keys_id_seq',
    ]) {
      await AppDataSource.query(`ALTER SEQUENCE "${secuencia}" RESTART WITH 1`);
    }

    const contar = async (t: string): Promise<number> =>
      (await AppDataSource.query(`SELECT count(*)::int AS n FROM "${t}"`))[0].n;

    console.log(
      `quedan -> users=${await contar('users')} tasks=${await contar('tasks')} ` +
      `assignments=${await contar('task_assignments')} ` +
      `notifications=${await contar('notifications')} ` +
      `claves=${await contar('idempotency_keys')}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('[vaciar] fallo:', error);
  process.exit(1);
});