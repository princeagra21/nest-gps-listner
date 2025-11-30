import { Module } from '@nestjs/common';
import { GT06Decoder } from './gt06/gt06.decoder';
import { TeltonikaDecoder } from './teltonika/teltonika.decoder';
import { ProtocolFactory } from './protocol.factory';

@Module({
  providers: [GT06Decoder, TeltonikaDecoder, ProtocolFactory],
  exports: [ProtocolFactory],
})
export class ProtocolsModule {}
