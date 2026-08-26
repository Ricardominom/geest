import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { TaskAssignment } from '../entities/TaskAssignment';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 120 })
  lastName!: string;

  /**
   * El correo se guarda normalizado a minusculas, de modo que el indice unico
   * trate "Ana@x.com" y "ana@x.com" como la misma persona.
   */
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => TaskAssignment, (assignment) => assignment.user)
  assignments!: TaskAssignment[];
}