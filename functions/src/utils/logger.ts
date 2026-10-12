import * as functions from 'firebase-functions/v1';

type LogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(severity: LogSeverity, message: string, data?: Record<string, any>) {
  if (severity === 'ERROR') {
    functions.logger.error(message, data || {});
  } else if (severity === 'WARN') {
    functions.logger.warn(message, data || {});
  } else if (severity === 'DEBUG') {
    functions.logger.debug(message, data || {});
  } else {
    functions.logger.info(message, data || {});
  }
}

export const logger = {
  log: (message: string, data?: Record<string, any>) => log('INFO', message, data),
  info: (message: string, data?: Record<string, any>) => log('INFO', message, data),
  warn: (message: string, data?: Record<string, any>) => log('WARN', message, data),
  error: (message: string, data?: Record<string, any>) => log('ERROR', message, data),
  debug: (message: string, data?: Record<string, any>) => log('DEBUG', message, data),
};
