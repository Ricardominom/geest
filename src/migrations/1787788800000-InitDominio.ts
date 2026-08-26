import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial del dominio.
 *
 * Se escribe el SQL a mano en lugar de generarlo automaticamente para que las
 * restricciones que sostienen el reto queden a la vista y sean auditables:
 *
 *   uq_users_email      -> un correo, un usuario
 *   pk_task_assignments -> nadie se asigna dos veces a la misma tarea
 *   chk_tasks_status    -> el estado solo puede ser open o archived
 */
export class InitDominio1787788800000 implements MigrationInterface {
  name = 'InitDominio1787788800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"         SERIAL       PRIMARY KEY,
        "name"       VARCHAR(120) NOT NULL,
        "last_name"  VARCHAR(120) NOT NULL,
        "email"      VARCHAR(254) NOT NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email")`);

    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id"          SERIAL       PRIMARY KEY,
        "title"       VARCHAR(200) NOT NULL,
        "description" TEXT,
        "status"      VARCHAR(20)  NOT NULL DEFAULT 'open',
        "archived_at" TIMESTAMPTZ,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "chk_tasks_status" CHECK ("status" IN ('open', 'archived'))
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_tasks_status" ON "tasks" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "task_assignments" (
        "task_id"      INTEGER     NOT NULL,
        "user_id"      INTEGER     NOT NULL,
        "completed"    BOOLEAN     NOT NULL DEFAULT false,
        "completed_at" TIMESTAMPTZ,
        "assigned_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_task_assignments" PRIMARY KEY ("task_id", "user_id"),
        CONSTRAINT "fk_task_assignments_task"
          FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_task_assignments_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
      )
    `);
    // GET /users/:id/tasks busca por usuario; sin este indice haria un scan
    // completo, porque la PK solo sirve para busquedas que empiecen por task_id.
    await queryRunner.query(
      `CREATE INDEX "idx_task_assignments_user" ON "task_assignments" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // En orden inverso: primero lo que depende de otras tablas.
    await queryRunner.query(`DROP TABLE IF EXISTS "task_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}