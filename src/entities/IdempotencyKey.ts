import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type IdempotencyStatus = 'in_progress' | 'completed';

@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index('uq_idempotency_keys_key', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  key!: string;

  @Column({ type: 'varchar', length: 255 })
  endpoint!: string;

  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ type: 'varchar', length: 20, default: 'in_progress' })
  status!: IdempotencyStatus;

  @Column({ name: 'response_status', type: 'integer', nullable: true })
  responseStatus!: number | null;

  @Column({ name: 'response_body', type: 'json', nullable: true })
  responseBody!: unknown;

  @Index('idx_idempotency_keys_created')
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}