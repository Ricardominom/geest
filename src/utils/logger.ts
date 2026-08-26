const silencioso = process.env.NODE_ENV === 'test';

export const log = {
  info: (...args: unknown[]): void => {
    if (!silencioso) console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    if (!silencioso) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    if (!silencioso) console.error(...args);
  },
};