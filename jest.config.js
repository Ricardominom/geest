/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],

  // Prepara la base de pruebas una sola vez, antes de todas las suites.
  globalSetup: '<rootDir>/tests/global-setup.ts',
  // Conecta y deja las tablas vacias antes de cada test.
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Un solo worker: todas las suites comparten la misma base y se pisarian
  // al truncar. El aislamiento real lo da el TRUNCATE entre tests.
  maxWorkers: 1,

  // Los tests de notificaciones esperan reintentos con backoff.
  testTimeout: 20000,

  clearMocks: true,
};