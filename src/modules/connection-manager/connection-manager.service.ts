import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Logger } from '@utils/logger';
import { ConnectionInfo, ConnectionStats } from './interfaces/connection.interface';

@Injectable()
export class ConnectionManagerService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(ConnectionManagerService.name);
  private redisClient: Redis;
  private readonly TTL = 3600; // 1 hour in seconds

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('app.redis');
    
    this.redisClient = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.redisClient.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.redisClient.on('error', (error) => {
      this.logger.error('Redis connection error', error.stack);
    });
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }

  /**
   * Store connection information
   */
  async storeConnection(connectionInfo: ConnectionInfo): Promise<void> {
    try {
      const key = `device:${connectionInfo.imei}`;
      const data = JSON.stringify({
        ...connectionInfo,
        connectedAt: connectionInfo.connectedAt.toISOString(),
        lastActivity: connectionInfo.lastActivity.toISOString(),
      });

      await this.redisClient.setex(key, this.TTL, data);
      
      // Also store in a set for quick lookups
      await this.redisClient.sadd('active_devices', connectionInfo.imei);
      
      this.logger.debug(`Stored connection for IMEI: ${connectionInfo.imei}`);
    } catch (error) {
      this.logger.error('Error storing connection', (error as Error).stack, {
        imei: connectionInfo.imei,
      });
    }
  }

  /**
   * Get connection information by IMEI
   */
  async getConnection(imei: string): Promise<ConnectionInfo | null> {
    try {
      const key = `device:${imei}`;
      const data = await this.redisClient.get(key);

      if (!data) {
        return null;
      }

      const parsed = JSON.parse(data);
      return {
        ...parsed,
        connectedAt: new Date(parsed.connectedAt),
        lastActivity: new Date(parsed.lastActivity),
      };
    } catch (error) {
      this.logger.error('Error getting connection', (error as Error).stack, {
        imei,
      });
      return null;
    }
  }

  /**
   * Update last activity timestamp
   */
  async updateActivity(imei: string): Promise<void> {
    try {
      const connection = await this.getConnection(imei);
      if (connection) {
        connection.lastActivity = new Date();
        await this.storeConnection(connection);
      }
    } catch (error) {
      this.logger.error('Error updating activity', (error as Error).stack, {
        imei,
      });
    }
  }

  /**
   * Remove connection
   */
  async removeConnection(imei: string): Promise<void> {
    try {
      const key = `device:${imei}`;
      await this.redisClient.del(key);
      await this.redisClient.srem('active_devices', imei);
      
      this.logger.debug(`Removed connection for IMEI: ${imei}`);
    } catch (error) {
      this.logger.error('Error removing connection', (error as Error).stack, {
        imei,
      });
    }
  }

  /**
   * Check if device is connected
   */
  async isConnected(imei: string): Promise<boolean> {
    try {
      const key = `device:${imei}`;
      const exists = await this.redisClient.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error('Error checking connection', (error as Error).stack, {
        imei,
      });
      return false;
    }
  }

  /**
   * Get all active device IMEIs
   */
  async getActiveDevices(): Promise<string[]> {
    try {
      return await this.redisClient.smembers('active_devices');
    } catch (error) {
      this.logger.error('Error getting active devices', (error as Error).stack);
      return [];
    }
  }

  /**
   * Get connection statistics
   */
  async getStats(): Promise<ConnectionStats> {
    try {
      const activeDevices = await this.getActiveDevices();
      const connectionsByProtocol: Record<string, number> = {};

      for (const imei of activeDevices) {
        const connection = await this.getConnection(imei);
        if (connection) {
          connectionsByProtocol[connection.protocol] = 
            (connectionsByProtocol[connection.protocol] || 0) + 1;
        }
      }

      return {
        totalConnections: activeDevices.length,
        activeConnections: activeDevices.length,
        connectionsByProtocol,
      };
    } catch (error) {
      this.logger.error('Error getting stats', (error as Error).stack);
      return {
        totalConnections: 0,
        activeConnections: 0,
        connectionsByProtocol: {},
      };
    }
  }

  /**
   * Clear all connections (useful for maintenance)
   */
  async clearAll(): Promise<void> {
    try {
      const devices = await this.getActiveDevices();
      for (const imei of devices) {
        await this.removeConnection(imei);
      }
      this.logger.log('Cleared all connections');
    } catch (error) {
      this.logger.error('Error clearing connections', (error as Error).stack);
    }
  }
}
