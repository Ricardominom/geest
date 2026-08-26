import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, OneToMany, PrimaryGeneratedColumn,
} from 'typeorm';
import { Task } from './Task';
import { NotificationAttempt } from './NotificationAttempt';

export type NotificationStatus = 'pending' | 'sent' | 'failed';

@Entity('notifications')
@Index('uq_notifications_task_event', ['taskId', 'eventType'], { unique: true })
export class Notification {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'task_id', type: 'integer' })
  taskId!: number;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: Task;

  @Column({ name: 'event_type', type: 'varchar', length: 50, default: 'task.archived' })
  eventType!: string;

  @Column({ type: 'json' })
  payload!: unknown;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: NotificationStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz' })
  nextAttemptAt!: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @OneToMany(() => NotificationAttempt, (attempt) => attempt.notification)
  attemptsLog!: NotificationAttempt[];
}