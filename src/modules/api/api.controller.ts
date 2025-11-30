import { Controller, Get } from '@nestjs/common';
import { TcpServerService } from '../tcp-server/tcp-server.service';
import { ConnectionManagerService } from '../connection-manager/connection-manager.service';
import { DeviceService } from '../device/device.service';
import { metrics } from '@utils/metrics';

@Controller('api')
export class ApiController {
  constructor(
    private tcpServerService: TcpServerService,
    private connectionManager: ConnectionManagerService,
    private deviceService: DeviceService,
  ) {}

  @Get('health')
  async getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('stats')
  async getStats() {
    const serverStats = this.tcpServerService.getServerStats();
    const connectionStats = await this.connectionManager.getStats();
    const cacheStats = this.deviceService.getCacheStats();

    return {
      server: serverStats,
      connections: connectionStats,
      cache: cacheStats,
      memory: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        rss: process.memoryUsage().rss,
      },
    };
  }

  @Get('metrics')
  async getMetrics() {
    return await metrics.getMetrics();
  }

  @Get('connections')
  async getConnections() {
    const activeDevices = await this.connectionManager.getActiveDevices();
    const connections = await Promise.all(
      activeDevices.map(async (imei) => {
        return await this.connectionManager.getConnection(imei);
      }),
    );

    return {
      total: activeDevices.length,
      devices: connections.filter((c) => c !== null),
    };
  }

  @Get('info')
  getInfo() {
    return {
      name: 'ListnerNest GPS Tracker Server',
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    };
  }
}
