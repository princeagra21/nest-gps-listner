import { ConfigService } from '@nestjs/config';
import { utilities as nestWinston, WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LoggerService } from '@nestjs/common';

/**
 * Factory function to create Winston logger instance
 * @param configService - NestJS ConfigService for accessing environment variables
 * @returns Winston logger instance or null logger if disabled
 */
export function createWinstonLogger(configService: ConfigService): LoggerService {
  const logEnabled = configService.get<boolean>('app.logs.enabled', true);
  const logLevel = configService.get<string>('app.logs.level', 'info');

  // Hard off switch: return silent logger if logging disabled
  if (!logEnabled) {
    return createSilentLogger();
  }

  // Define log format
  const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  );

  // Console format with colors
  const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.ms(),
    nestWinston.format.nestLike('GPS-Tracker', {
      colors: true,
      prettyPrint: true,
    }),
  );

  // Daily rotate file transport configuration
  const dailyRotateFileTransport = new DailyRotateFile({
    dirname: 'logs',
    filename: '%DATE%.log',
    datePattern: 'DD-MM-YYYY',
    zippedArchive: false,
    maxSize: '20m',
    maxFiles: '30d',
    format: logFormat,
    auditFile: 'logs/.audit.json',
  });

  // Create Winston logger instance
  const logger = WinstonModule.createLogger({
    level: logLevel,
    format: logFormat,
    transports: [
      // Console transport
      new winston.transports.Console({
        format: consoleFormat,
      }),
      // Daily rotating file transport
      dailyRotateFileTransport,
    ],
    // Handle exceptions and rejections
    exceptionHandlers: [
      new DailyRotateFile({
        dirname: 'logs',
        filename: '%DATE%-exceptions.log',
        datePattern: 'DD-MM-YYYY',
        zippedArchive: false,
        maxSize: '20m',
        maxFiles: '30d',
      }),
    ],
    rejectionHandlers: [
      new DailyRotateFile({
        dirname: 'logs',
        filename: '%DATE%-rejections.log',
        datePattern: 'DD-MM-YYYY',
        zippedArchive: false,
        maxSize: '20m',
        maxFiles: '30d',
      }),
    ],
  });

  return logger;
}

/**
 * Creates a silent logger that produces no output
 * Used when LOG_ENABLED=false
 */
function createSilentLogger(): LoggerService {
  return {
    log: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    verbose: () => {},
  };
}
