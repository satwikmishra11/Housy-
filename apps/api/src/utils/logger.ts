import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  base: {
    service: 'housy-api',
    env: config.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'password',
      'password_hash',
      'email',
      'phone',
      'phone_e164',
      'token',
      'jwt',
      'secret',
      'magicToken',
      '*.password',
      '*.password_hash',
      '*.email',
      '*.phone',
      '*.phone_e164',
      '*.token',
      '*.jwt',
    ],
    censor: '[REDACTED]',
  },
});

