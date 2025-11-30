import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@utils/logger';

// Generic Device type - will match your existing table structure
export interface Device {
  id?: number;
  imei: string;
  [key: string]: any; // Allow any other fields from your existing table
}

@Injectable()
export class DeviceRepository extends PrismaClient implements OnModuleInit {
  private logger = new Logger(DeviceRepository.name);

  constructor(private configService: ConfigService) {
    const poolSize = configService.get<number>('app.database.poolSize', 50);
    
    super({
      datasources: {
        db: {
          url: configService.get<string>('app.database.url'),
        },
      },
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected successfully');

    // Log events
    this.$on('warn' as never, (e: any) => {
      this.logger.warn('Prisma warning', e);
    });

    this.$on('error' as never, (e: any) => {
      this.logger.error('Prisma error', JSON.stringify(e));
    });
  }

  /**
   * Find device by IMEI
   * Note: Adjust the table name 'devices' and column names to match your existing schema
   */
  async findByImei(imei: string): Promise<Device | null> {
    try {
      // Using raw query to be flexible with your existing schema
      const result = await this.$queryRaw<Device[]>`
        SELECT * FROM devices WHERE imei = ${imei} LIMIT 1
      `;
      return result[0] || null;
    } catch (error) {
      this.logger.error('Error finding device by IMEI', (error as Error).stack);
      return null;
    }
  }

  /**
   * Find active device by IMEI
   * Adjust column names to match your schema (e.g., 'active', 'status', 'is_active', etc.)
   */
  async findActiveByImei(imei: string): Promise<Device | null> {
    try {
      // Adjust 'active' column name if different in your schema
      const result = await this.$queryRaw<Device[]>`
        SELECT * FROM devices 
        WHERE imei = ${imei} 
        AND (active = true OR active = 1 OR status = 'active')
        LIMIT 1
      `;
      return result[0] || null;
    } catch (error) {
      this.logger.error('Error finding active device', (error as Error).stack);
      return null;
    }
  }

  /**
   * Update last connect timestamp
   * Adjust column name if different in your schema
   */
  async updateLastConnect(imei: string): Promise<void> {
    try {
      // Adjust column name (last_connect, last_connection, updated_at, etc.)
      await this.$executeRaw`
        UPDATE devices 
        SET last_connect = NOW() 
        WHERE imei = ${imei}
      `;
    } catch (error) {
      this.logger.error('Error updating last connect', (error as Error).stack);
    }
  }

  /**
   * Get all active devices
   */
  async getAllActiveDevices(): Promise<Device[]> {
    try {
      return await this.$queryRaw<Device[]>`
        SELECT * FROM devices 
        WHERE active = true OR active = 1 OR status = 'active'
      `;
    } catch (error) {
      this.logger.error('Error getting active devices', (error as Error).stack);
      return [];
    }
  }
}
