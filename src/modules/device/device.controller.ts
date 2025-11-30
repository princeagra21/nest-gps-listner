import { Controller, Get, Param, Delete } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceRepository } from './device.repository';
import { ConnectionManagerService } from '../connection-manager/connection-manager.service';

@Controller('api/devices')
export class DeviceController {
  constructor(
    private deviceService: DeviceService,
    private deviceRepository: DeviceRepository,
    private connectionManager: ConnectionManagerService,
  ) {}

  @Get()
  async getAllDevices() {
    const devices = await this.deviceRepository.getAllActiveDevices();
    return {
      total: devices.length,
      devices,
    };
  }

  @Get(':imei')
  async getDeviceByImei(@Param('imei') imei: string) {
    const device = await this.deviceRepository.findByImei(imei);
    const connection = await this.connectionManager.getConnection(imei);
    const isConnected = await this.connectionManager.isConnected(imei);

    return {
      device,
      connection,
      isConnected,
    };
  }

  @Delete(':imei/cache')
  clearDeviceCache(@Param('imei') imei: string) {
    this.deviceService.clearCache(imei);
    return {
      message: `Cache cleared for device ${imei}`,
    };
  }

  @Delete('cache')
  clearAllCache() {
    this.deviceService.clearAllCache();
    return {
      message: 'All device cache cleared',
    };
  }
}
