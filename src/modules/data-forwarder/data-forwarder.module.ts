import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DataForwarderService } from './data-forwarder.service';

@Module({
  imports: [HttpModule],
  providers: [DataForwarderService],
  exports: [DataForwarderService],
})
export class DataForwarderModule {}
