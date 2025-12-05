import { Module } from '@nestjs/common';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';
import { TcpServerModule } from '../tcp-server/tcp-server.module';
import { ConnectionManagerModule } from '../connection-manager/connection-manager.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TcpServerModule,
    ConnectionManagerModule,    
    CommonModule,
  ],
  controllers: [ApiController],
  providers: [ApiService],
  exports: [ApiService],
})
export class ApiModule {}
