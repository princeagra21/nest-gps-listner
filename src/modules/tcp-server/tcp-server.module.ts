import { Module } from '@nestjs/common';
import { TcpServerService } from './tcp-server.service';
import { ProtocolsModule } from '../protocols/protocols.module';
import { ConnectionManagerModule } from '../connection-manager/connection-manager.module';
import { DeviceModule } from '../device/device.module';
import { DataForwarderModule } from '../data-forwarder/data-forwarder.module';

@Module({
  imports: [
    ProtocolsModule,
    ConnectionManagerModule,
    DeviceModule,
    DataForwarderModule,
  ],
  providers: [TcpServerService],
  exports: [TcpServerService],
})
export class TcpServerModule {}
