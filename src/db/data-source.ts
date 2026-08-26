import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { User } from '../entities/User';
import { Task } from '../entities/Task';
import { TaskAssignment } from '../entities/TaskAssignment';
import { InitDominio1787788800000 } from '../migrations/1787788800000-InitDominio';
import { EmailCaseInsensitive1787800000000 } from '../migrations/1787800000000-EmailCaseInsensitive';

const useSsl = /supabase|render|neon|amazonaws/i.test(env.databaseUrl);

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  entities: [User, Task, TaskAssignment],
  migrations: [InitDominio1787788800000, EmailCaseInsensitive1787800000000],
  synchronize: false,
  logging: env.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
});