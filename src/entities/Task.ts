import {
  Column, CreateDateColumn, Entity, Index, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { TaskAssignment } from './TaskAssignment';

export type TaskStatus = 'open' | 'archived';

export const TASK_STATUSES: TaskStatus[] = ['open', 'archived'];

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /**
   * Este campo NO se edita a mano: es una consecuencia de que todas las filas
   * de task_assignments esten completadas. Se indexa porque GET /tasks filtra
   * por el.
   */
  @Index('idx_tasks_status')
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: TaskStatus;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => TaskAssignment, (assignment) => assignment.task)
  assignments!: TaskAssignment[];
}