import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hace que el correo sea unico sin distinguir mayusculas.
 *
 * Un indice unico normal compara byte a byte, asi que "Ana@x.com" y
 * "ana@x.com" conviven como dos usuarios distintos. La aplicacion normaliza a
 * minusculas antes de guardar, pero eso solo protege lo que entra por la API:
 * un script o el panel de Supabase se saltarian esa normalizacion.
 *
 * Indexando la expresion lower(email), la garantia deja de depender de que
 * todo el mundo se porte bien.
 */
export class EmailCaseInsensitive1787800000000 implements MigrationInterface {
  name = 'EmailCaseInsensitive1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Se reemplaza en vez de anadir otro: dos indices sobre lo mismo serian
    // trabajo duplicado en cada escritura y una garantia mas debil conviviendo
    // con una mas fuerte.
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_email"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_email" ON "users" (lower("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_email"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email")`);
  }
}