import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { LoggerModule } from './modules/logger/logger.module';
import { TcpServerModule } from './modules/tcp-server/tcp-server.module';
import { ApiModule } from './modules/api/api.module';
import { PrismaModule } from './modules/sqlconnection/prisma.module';
import { CommonModule } from './modules/common/common.module';
import { ConnectionManagerModule } from './modules/connection-manager/connection-manager.module';
import { AutosyncModule } from './modules/autosync/autosync.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      envFilePath: '.env',
    }),
    LoggerModule, // Global logger module - load first
    PrismaModule,
    CommonModule,
    ConnectionManagerModule, // Redis connection - must load before AutosyncModule
    AutosyncModule,
    TcpServerModule,
    ApiModule,
  ],
})
export class AppModule {}
