import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceRepository } from './device.repository';
import { DeviceController } from './device.controller';
import { ConnectionManagerModule } from '../connection-manager/connection-manager.module';

@Module({
  imports: [ConnectionManagerModule],
  providers: [DeviceService, DeviceRepository],
  controllers: [DeviceController],
  exports: [DeviceService, DeviceRepository],
})
export class DeviceModule {}
