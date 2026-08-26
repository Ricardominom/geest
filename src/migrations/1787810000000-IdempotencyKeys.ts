import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdempotencyKeys1787810000000 implements MigrationInterface {
  name = 'IdempotencyKeys1787810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id"              bigserial     PRIMARY KEY,
        "key"             varchar(255)  NOT NULL,
        "endpoint"        varchar(255)  NOT NULL,
        "request_hash"    char(64)      NOT NULL,
        "status"          varchar(20)   NOT NULL DEFAULT 'in_progress',
        "response_status" integer       NULL,
        "response_body"   jsonb         NULL,
        "created_at"      timestamptz   NOT NULL DEFAULT now(),
        "completed_at"    timestamptz   NULL,
        CONSTRAINT "chk_idempotency_status"
          CHECK ("status" IN ('in_progress', 'completed'))
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_idempotency_keys_key" ON "idempotency_keys" ("key")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_idempotency_keys_created" ON "idempotency_keys" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "idempotency_keys"`);
  }
}