import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWinstonLogger } from './logger.factory';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

/**
 * Global Logger Module
 * 
 * Provides Winston-based logger with daily file rotation.
 * 
 * Features:
 * - Daily log rotation with dd-mm-yyyy.log format
 * - Console + file logging when LOG_ENABLED=true
 * - Complete silence when LOG_ENABLED=false
 * - Automatic exception and rejection handling
 * - Configurable log levels via LOG_LEVEL env var
 * 
 * Environment Variables:
 * - LOG_ENABLED: true|false (default: true)
 * - LOG_LEVEL: error|warn|info|debug|verbose (default: info)
 * 
 * Log Directory: ./logs (relative to project root)
 */
@Global()
@Module({
  providers: [
    {
      provide: WINSTON_MODULE_NEST_PROVIDER,
      useFactory: (configService: ConfigService) => {
        return createWinstonLogger(configService);
      },
      inject: [ConfigService],
    },
  ],
  exports: [WINSTON_MODULE_NEST_PROVIDER],
})
export class LoggerModule {}
