/**
 * Logger wrapper — silencia logs en producción.
 * Uso: import { logger } from './logger';
 * logger.log('mensaje'), logger.warn('warn'), logger.error('error')
 */

type LogFn = (...args: any[]) => void;

interface Logger {
  log: LogFn;
  info: LogFn;
  warn: LogFn;
  error: LogFn;
  debug: LogFn;
}

const noop: LogFn = () => {};

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

export const logger: Logger = {
  log: isDev ? console.log.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: isDev ? console.debug.bind(console) : noop,
};

export default logger;
