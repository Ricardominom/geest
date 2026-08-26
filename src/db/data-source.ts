import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
 
const useSsl = /supabase|render|neon|amazonaws/i.test(env.databaseUrl);

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: env.databaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  entities: [],
  migrations: [],
  synchronize: false,
  logging: env.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
});