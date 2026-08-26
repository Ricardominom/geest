import 'reflect-metadata';
import { AppDataSource } from '../src/db/data-source';

/**
 * Borra UNICAMENTE lo que generan los scripts de prueba, identificado por
 * prefijo. Nunca toca datos que no encajen en estos patrones.
 * Las asignaciones caen solas por el ON DELETE CASCADE.
 */
const EMAILS = ['idem.%@example.com', 'conc.%@example.com', 'notif.%@example.com'];
const TITULOS = ['Concurrencia %', 'Notif %'];
const CLAVES = ['idem-%'];

async function borrar(sql: string, patrones: string[]): Promise<number> {
  let total = 0;
  for (const patron of patrones) {
    const resultado = await AppDataSource.query(`${sql} RETURNING 1`, [patron]);
    total += (Array.isArray(resultado[0]) ? resultado[0] : resultado).length;
  }
  return total;
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const tareas = await borrar(`DELETE FROM "tasks" WHERE "title" LIKE $1`, TITULOS);
    const usuarios = await borrar(`DELETE FROM "users" WHERE "email" LIKE $1`, EMAILS);
    const claves = await borrar(`DELETE FROM "idempotency_keys" WHERE "key" LIKE $1`, CLAVES);
    console.log(`borrados -> ${tareas} tareas, ${usuarios} usuarios, ${claves} claves`);

    const contar = async (t: string): Promise<number> =>
      (await AppDataSource.query(`SELECT count(*)::int AS n FROM "${t}"`))[0].n;
    console.log(
      `quedan   -> users=${await contar('users')} tasks=${await contar('tasks')} ` +
      `assignments=${await contar('task_assignments')} claves=${await contar('idempotency_keys')}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('[limpieza] fallo:', error);
  process.exit(1);
});