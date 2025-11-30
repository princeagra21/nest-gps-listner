import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { TcpServerModule } from '../tcp-server/tcp-server.module';
import { ConnectionManagerModule } from '../connection-manager/connection-manager.module';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [TcpServerModule, ConnectionManagerModule, DeviceModule],
  controllers: [ApiController],
})
export class ApiModule {}
