import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  // Check if logging is enabled BEFORE creating the app
  const logEnabled = process.env.LOG_ENABLED === 'true';
  
  // Create NestJS application with Fastify adapter
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
    }),
    {
      // Hard off switch: disable all NestJS logs if LOG_ENABLED=false
      logger: logEnabled ? ['log', 'error', 'warn', 'debug', 'verbose'] : false,
    },
  );

  // Get Winston logger from DI container
  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  
  // Replace NestJS logger with Winston logger
  app.useLogger(winstonLogger);

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable CORS for API
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  // Get API port from environment
  const configService = app.get(ConfigService);
  const apiPort = configService.get<number>('app.api.port', 5055);
  const gt06Port = configService.get<number>('app.ports.gt06', 5023);
  const teltonikaPort = configService.get<number>('app.ports.teltonika', 5024);
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  // Start HTTP API server
  await app.listen(apiPort, '0.0.0.0');
  
  // Log startup information (will be silent if LOG_ENABLED=false)
  winstonLogger.log(`🚀 API Server started on http://0.0.0.0:${apiPort}`);
  winstonLogger.log(`📊 Health check: http://0.0.0.0:${apiPort}/api/health`);
  winstonLogger.log(`📈 Metrics: http://0.0.0.0:${apiPort}/api/metrics`);
  winstonLogger.log(`🔌 TCP Servers started on ports: ${gt06Port}, ${teltonikaPort}`);
  winstonLogger.log(`🎯 Environment: ${nodeEnv}`);
  winstonLogger.log(`📝 Logging: ${logEnabled ? 'ENABLED' : 'DISABLED'}`);
}

bootstrap().catch((error) => {
  // Even on error, respect the LOG_ENABLED setting
  if (process.env.LOG_ENABLED === 'true') {
    console.error('❌ Failed to start application:', error);
  }
  process.exit(1);
});
