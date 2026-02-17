/**
 * Structured logging utility.
 *
 * Wraps pino for structured JSON logging with consistent formatting.
 */

import pino from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface CreateLoggerOptions {
  name: string;
  level?: LogLevel;
  pretty?: boolean;
}

/**
 * Create a named logger instance.
 *
 * @example
 * ```typescript
 * const logger = createLogger({ name: 'agent-engine' });
 * logger.info({ sessionId: '123' }, 'Agent started');
 * ```
 */
export function createLogger(options: CreateLoggerOptions): pino.Logger {
  const { name, level = 'info', pretty = process.env.NODE_ENV !== 'production' } = options;

  return pino({
    name,
    level,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  });
}

/** Default application logger */
export const logger = createLogger({
  name: 'fleetwide',
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
});
