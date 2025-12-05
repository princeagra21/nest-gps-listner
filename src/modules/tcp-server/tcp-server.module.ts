import { Module } from '@nestjs/common';
import { TcpServerService } from './tcp-server.service';
import { ProtocolsModule } from '../protocols/protocols.module';
import { ConnectionManagerModule } from '../connection-manager/connection-manager.module';


@Module({
  imports: [
    ProtocolsModule,
    ConnectionManagerModule
    
  ],
  providers: [TcpServerService],
  exports: [TcpServerService],
})
export class TcpServerModule {}
