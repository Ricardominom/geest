import { MigrationInterface, QueryRunner } from 'typeorm';

export class Outbox1787830000000 implements MigrationInterface {
  name = 'Outbox1787830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"              bigserial    PRIMARY KEY,
        "task_id"         integer      NOT NULL,
        "event_type"      varchar(50)  NOT NULL DEFAULT 'task.archived',
        "payload"         json         NOT NULL,
        "status"          varchar(20)  NOT NULL DEFAULT 'pending',
        "attempts"        integer      NOT NULL DEFAULT 0,
        "next_attempt_at" timestamptz  NOT NULL DEFAULT now(),
        "last_error"      text         NULL,
        "created_at"      timestamptz  NOT NULL DEFAULT now(),
        "sent_at"         timestamptz  NULL,
        CONSTRAINT "fk_notifications_task" FOREIGN KEY ("task_id")
          REFERENCES "tasks" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_notifications_status"
          CHECK ("status" IN ('pending', 'sent', 'failed')),
        CONSTRAINT "chk_notifications_attempts" CHECK ("attempts" >= 0)
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_notifications_task_event"
         ON "notifications" ("task_id", "event_type")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_notifications_pendientes"
         ON "notifications" ("next_attempt_at")
       WHERE "status" = 'pending'`,
    );

    await queryRunner.query(`
      CREATE TABLE "notification_attempts" (
        "id"              bigserial   PRIMARY KEY,
        "notification_id" bigint      NOT NULL,
        "attempt_number"  integer     NOT NULL,
        "http_status"     integer     NULL,
        "error"           text        NULL,
        "duration_ms"     integer     NOT NULL,
        "attempted_at"    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fk_attempts_notification" FOREIGN KEY ("notification_id")
          REFERENCES "notifications" ("id") ON DELETE CASCADE,
        CONSTRAINT "chk_attempts_number" CHECK ("attempt_number" >= 1)
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_attempts_notification_number"
         ON "notification_attempts" ("notification_id", "attempt_number")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_attempts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}