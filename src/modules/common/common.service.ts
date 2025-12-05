import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../sqlconnection/prisma.service';
import { ConnectionManagerService } from '../connection-manager/connection-manager.service';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { DeviceStatusPayload } from '@/types/devicestatus';

@Injectable()
export class CommonService {
  private readonly logger = new Logger(CommonService.name);

  private readonly DEVICE_IMEI_SET_KEY: string;
  private readonly DEVICE_STATUS_HASH_KEY: string;
  private readonly COMMAND_QUEUE_KEY_PREFIX: string;

  constructor(private readonly prisma: PrismaService,
    private readonly connectionManager: ConnectionManagerService,
    private readonly configService: ConfigService,
  ) {
    this.DEVICE_IMEI_SET_KEY = this.configService.get('app.rediskeys.deviceImeiSet') as string;
    this.DEVICE_STATUS_HASH_KEY = this.configService.get('app.rediskeys.deviceStatusHash') as string;
    this.COMMAND_QUEUE_KEY_PREFIX = this.configService.get('app.rediskeys.commandQueuePrefix') as string;
  }


  // 👇 Central place to access Redis
  private get redisClient() {
    return this.connectionManager.getRedisClient();
  }



  /**
   * Utility: Delay helper
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async validateImei(imei: string): Promise<boolean> {
    const exists = await this.redisClient.sismember(this.DEVICE_IMEI_SET_KEY, imei);
    return exists === 1;
  }

  async updateDeviceLiveStatus(payload: DeviceStatusPayload): Promise<void> {
    try {
      const existingJson = await this.redisClient.hget(
        this.DEVICE_STATUS_HASH_KEY,
        payload.imei,
      );

      // Parse existing or start with new object
      const merged = existingJson 
        ? JSON.parse(existingJson) 
        : { imei: payload.imei };

      // Direct property assignment for better performance
      if (payload.status !== undefined) merged.status = payload.status;
      if (payload.updatedAt !== undefined) merged.updatedAt = payload.updatedAt;
      if (payload.acc !== undefined) merged.acc = payload.acc;
      if (payload.course !== undefined) merged.course = payload.course;
      if (payload.lat !== undefined) merged.lat = payload.lat;
      if (payload.lon !== undefined) merged.lon = payload.lon;
      if (payload.satellites !== undefined) merged.satellites = payload.satellites;
      if (payload.speed !== undefined) merged.speed = payload.speed;

      // Single Redis write
      await this.redisClient.hset(
        this.DEVICE_STATUS_HASH_KEY,
        payload.imei,
        JSON.stringify(merged),
      );
    } catch (error) {
      this.logger.error(
        `Failed to update device status for IMEI=${payload.imei}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  async getDeviceCommands(imei: string): Promise<Array<{id:number,command: string}>> {
    const key = `${this.COMMAND_QUEUE_KEY_PREFIX}${imei}`;
    const commands = await this.redisClient.lrange(key, 0, -1);   
    return commands.map((cmd) => {
      const parsed = JSON.parse(cmd);
      return { id: parseInt(parsed.id), command: parsed.command };
    });
  }

  async removeDeviceCommand(imei: string, commandId: number): Promise<void> {
    const key = `${this.COMMAND_QUEUE_KEY_PREFIX}${imei}`;
    
    // Get all commands to find the one with matching ID
    const commands = await this.redisClient.lrange(key, 0, -1);
    const commandToRemove = commands.find(cmd => {
      const parsed = JSON.parse(cmd);
      return parseInt(parsed.id) === commandId;
    });
    
    // Remove the full JSON string from Redis
    if (commandToRemove) {
      await this.redisClient.lrem(key, 1, commandToRemove);
    }
    
    // Delete from database
    await this.prisma.commandQueue.delete({
      where: {
        id: commandId,
      },
    });
   
  }
}
