import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Task } from './Task';
import { User } from './User';

/**
 * Relacion N:M entre tareas y usuarios, con estado propio por participante.
 *
 * "Completado" no es un atributo de la tarea ni del usuario, sino del cruce
 * entre ambos: cada fila es el renglon de una persona en una tarea concreta.
 *
 * La llave primaria compuesta (task_id, user_id) es lo que impide, en la
 * propia base de datos, que alguien quede asignado dos veces a la misma
 * tarea. No se comprueba con un IF en la aplicacion: no cabe.
 */
@Entity('task_assignments')
export class TaskAssignment {
  @PrimaryColumn({ name: 'task_id', type: 'integer' })
  taskId!: number;

  @PrimaryColumn({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ type: 'boolean', default: false })
  completed!: boolean;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;

  @ManyToOne(() => Task, (task) => task.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: Task;

  @ManyToOne(() => User, (user) => user.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}