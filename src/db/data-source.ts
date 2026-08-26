import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { User } from '../entities/User';
import { Task } from '../entities/Task';
import { TaskAssignment } from '../entities/TaskAssignment';
import { InitDominio1787788800000 } from '../migrations/1787788800000-InitDominio';
import { IdempotencyKey } from '../entities/IdempotencyKey';
import { IdempotencyKeys1787810000000 } from '../migrations/1787810000000-IdempotencyKeys';
import { EmailCaseInsensitive1787800000000 } from '../migrations/1787800000000-EmailCaseInsensitive';
import { ResponseBodyComoJson1787820000000 } from '../migrations/1787820000000-ResponseBodyComoJson';
import { Notification } from '../entities/Notification';
import { NotificationAttempt } from '../entities/NotificationAttempt';
import { Outbox1787830000000 } from '../migrations/1787830000000-Outbox';

const useSsl = /supabase|render|neon|amazonaws/i.test(env.databaseUrl);

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  entities: [User, Task, TaskAssignment, IdempotencyKey, Notification, NotificationAttempt],
  migrations: [
    InitDominio1787788800000,
    EmailCaseInsensitive1787800000000,
    IdempotencyKeys1787810000000,
    ResponseBodyComoJson1787820000000,
    Outbox1787830000000,
  ],
  synchronize: false,
  logging: env.nodeEnv === 'test' ? false : env.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
});