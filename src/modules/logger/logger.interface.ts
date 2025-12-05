import { LoggerService } from '@nestjs/common';

/**
 * Extended Logger Service interface that includes debug method
 * Winston logger supports debug, but NestJS's LoggerService interface doesn't include it
 */
export interface ExtendedLoggerService extends LoggerService {
  debug(message: any, context?: string): void;
  debug(message: any, ...optionalParams: any[]): void;
}
