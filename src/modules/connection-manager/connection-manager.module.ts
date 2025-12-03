import { Global, Module } from '@nestjs/common';
import { ConnectionManagerService } from './connection-manager.service';

@Global()
@Module({
  providers: [ConnectionManagerService],
  exports: [ConnectionManagerService],
})
export class ConnectionManagerModule {}
