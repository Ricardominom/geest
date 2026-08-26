import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResponseBodyComoJson1787820000000 implements MigrationInterface {
  name = 'ResponseBodyComoJson1787820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys"
         ALTER COLUMN "response_body" TYPE json USING "response_body"::text::json`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys"
         ALTER COLUMN "response_body" TYPE jsonb USING "response_body"::text::jsonb`,
    );
  }
}