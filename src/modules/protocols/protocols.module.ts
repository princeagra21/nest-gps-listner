import { Module } from '@nestjs/common';
import { GT06Service } from './gt06/gt06.service';
import { TeltonikaService } from './teltonika/teltonika.service';
import { ProtocolFactory } from './protocol.factory';
import { CommonModule } from '../common/common.module';
import { DataForwarderModule } from '../data-forwarder/data-forwarder.module';

@Module({
  imports: [CommonModule, DataForwarderModule],
  providers: [GT06Service, TeltonikaService, ProtocolFactory],
  exports: [ProtocolFactory],
})
export class ProtocolsModule {}
