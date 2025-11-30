import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@utils/logger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  // Create NestJS application with Fastify adapter for better performance
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
    }),
  );

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
  const apiPort = process.env.API_PORT || 5055;

  // Start HTTP API server
  await app.listen(apiPort, '0.0.0.0');
  
  logger.log(`🚀 API Server started on http://0.0.0.0:${apiPort}`);
  logger.log(`📊 Health check: http://0.0.0.0:${apiPort}/api/health`);
  logger.log(`📈 Metrics: http://0.0.0.0:${apiPort}/api/metrics`);
  logger.log(`🔌 TCP Servers started on ports: ${process.env.GT06_PORT}, ${process.env.TELTONIKA_PORT}`);
  logger.log(`🎯 Environment: ${process.env.NODE_ENV}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
