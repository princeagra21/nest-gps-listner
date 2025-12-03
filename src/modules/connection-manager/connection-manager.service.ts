import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Logger } from '@utils/logger';
import { ConnectionInfo, ConnectionStats } from './interfaces/connection.interface';
import { RedisStarter } from '@utils/redisstart';

@Injectable()
export class ConnectionManagerService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(ConnectionManagerService.name);
  private redisClient: Redis;
  private readonly TTL = 3600; // 1 hour in seconds

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisConfig = this.configService.get('app.redis');
    
    // Attempt to connect to Redis
    await this.initializeRedis(redisConfig);
  }

  /**
   * Initialize Redis connection with auto-start capability
   * @private
   */
  private async initializeRedis(redisConfig: any): Promise<void> {
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
      lazyConnect: true, // Don't connect immediately
    });

    this.redisClient.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.redisClient.on('error', (error) => {
      this.logger.error('Redis connection error', error.stack);
    });

    try {
      // Attempt connection
      await this.redisClient.connect();
      this.logger.log('Redis connection established');
    } catch (error) {
      this.logger.warn(
        'Failed to connect to Redis, attempting auto-start',
        error.message,
      );
      await this.attemptRedisAutoStart(redisConfig);
    }
  }

  /**
   * Attempts to start Redis service based on the operating system
   * @private
   */
  private async attemptRedisAutoStart(redisConfig: any): Promise<void> {
    try {
      // Disconnect the failed client
      try {
        await this.redisClient.disconnect();
      } catch (disconnectError) {
        // Ignore disconnect errors
        this.logger.debug('Client disconnect error (ignored)', disconnectError.message);
      }
      
      // Use RedisStarter utility to start Redis
      await RedisStarter.start();

      // Create a new Redis client for reconnection
      this.redisClient = new Redis({
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password,
        db: redisConfig.db,
        retryStrategy: (times) => {
          if (times > 10) {
            this.logger.error('Redis retry limit reached');
            return null; // Stop retrying
          }
          const delay = Math.min(times * 200, 3000);
          this.logger.debug(`Retrying Redis connection in ${delay}ms (attempt ${times})`);
          return delay;
        },
        maxRetriesPerRequest: 10,
        connectTimeout: 15000,
        lazyConnect: true,
      });

      this.redisClient.on('connect', () => {
        this.logger.log('Redis connected successfully');
      });

      this.redisClient.on('error', (error) => {
        // Only log if not a connection error during startup
        if (!error.message.includes('ECONNREFUSED')) {
          this.logger.error('Redis connection error', error.stack);
        }
      });

      // Retry connection after Redis has started
      this.logger.log('Attempting to reconnect to Redis...');
      await this.redisClient.connect();
      this.logger.log('Successfully connected to Redis after auto-start');
    } catch (error) {
      this.logger.error('Redis auto-start procedure failed', error.message);
      throw new Error(`Unable to establish Redis connection: ${error.message}`);
    }
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

  /**
   * Get the Redis client instance for direct access
   * Use this when you need to perform custom Redis operations
   */
  getRedisClient(): Redis {
    return this.redisClient;
  }
}
