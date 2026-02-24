import winston from 'winston';
import { env, isDevelopment } from './env';
import path from 'path';
import fs from 'fs';

/**
 * Winston Logger Configuration
 */

// Ensure logs directory exists
const logsDir = path.dirname(env.LOG_FILE_PATH);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Create transports
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: isDevelopment ? consoleFormat : logFormat,
    level: env.LOG_LEVEL
  })
];

// File transport for production
if (!isDevelopment) {
  transports.push(
    new winston.transports.File({
      filename: env.LOG_FILE_PATH,
      format: logFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 10485760,
      maxFiles: 5
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  transports,
  exitOnError: false
});

// Create a stream for Morgan HTTP logger
export const loggerStream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

export default logger;
