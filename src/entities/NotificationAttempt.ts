import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Notification } from './Notification';

@Entity('notification_attempts')
@Index('uq_attempts_notification_number', ['notificationId', 'attemptNumber'], { unique: true })
export class NotificationAttempt {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'notification_id', type: 'bigint' })
  notificationId!: string;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification!: Notification;

  @Column({ name: 'attempt_number', type: 'integer' })
  attemptNumber!: number;

  /** NULL cuando no hubo respuesta (timeout, DNS, conexion rechazada). */
  @Column({ name: 'http_status', type: 'integer', nullable: true })
  httpStatus!: number | null;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'duration_ms', type: 'integer' })
  durationMs!: number;

  @CreateDateColumn({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt!: Date;
}