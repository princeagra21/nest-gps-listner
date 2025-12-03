import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AutosyncService } from './autosync.service';
import { ConnectionManagerModule } from '../connection-manager/connection-manager.module';
import { PrismaModule } from '../sqlconnection/prisma.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConnectionManagerModule,
    PrismaModule
  ],
  providers: [AutosyncService],
  exports: [AutosyncService],
})
export class AutosyncModule {}
