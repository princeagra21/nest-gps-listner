import { Injectable, Logger, OnApplicationBootstrap, BeforeApplicationShutdown } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CommonService } from '../common/common.service';
import { ConnectionManagerService } from '../connection-manager/connection-manager.service';
import Redis from 'ioredis';
import { PrismaService } from '../sqlconnection/prisma.service';

@Injectable()
export class AutosyncService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(AutosyncService.name);
  private redis: Redis;
  private isSyncing = false;
  private readonly DEVICE_IMEI_SET_KEY = 'devices:imei:set';

  constructor(
    private readonly commonService: CommonService,
    private readonly connectionManager: ConnectionManagerService,
    private readonly prisma: PrismaService,
  ) {}

  // 1) APP STARTUP SYNC
  async onApplicationBootstrap() {
    this.logger.log('Application bootstrap complete. Starting initial data sync...');
    
    // Get Redis client after ConnectionManager has initialized
    this.redis = this.connectionManager.getRedisClient();
    
    if (!this.redis) {
      this.logger.error('❌ Redis client not available from ConnectionManager');
      return;
    }
    
    this.logger.log('✅ AutoSync service using shared Redis connection');
    await this.syncInitialData();
  }

  // 2) 5 MINUTE INTERVAL JOB
  @Interval(5 * 60 * 1000) // 5 minutes in milliseconds
  async handleFiveMinuteSync() {
    if (!this.redis) {
      this.logger.warn('⚠️ Redis not initialized, skipping interval sync');
      return;
    }
    
    this.logger.debug('⏱ 5-minute interval sync triggered');
    // write program to sync data every 5 minutes
  }

  // 3) GRACEFUL SHUTDOWN
  async beforeApplicationShutdown(signal?: string) {
    this.logger.log(`⚠️ Application shutdown initiated (signal: ${signal}). Cleaning up AutoSync...`);
    
    try {
      // Wait for any ongoing sync to complete
      if (this.isSyncing) {
        this.logger.log('Waiting for ongoing sync to complete...');
        let waitTime = 0;
        while (this.isSyncing && waitTime < 30000) { // Max 30 seconds wait
          await this.commonService.delay(1000);
          waitTime += 1000;
        }
      }
      
      this.logger.log('✅ AutoSync cleanup completed (Redis connection managed by ConnectionManager)');
    } catch (error) {
      this.logger.error('Error during AutoSync shutdown:', error);
    }
  }



  /**
   * Public method to get Redis client (delegated to ConnectionManager)
   */
  getRedisClient(): Redis {
    return this.redis;
  }

  async syncInitialData(): Promise<void> {
    if (!this.redis) {
      this.logger.error('❌ Redis client not available, cannot sync');
      return;
    }

    if (this.isSyncing) {
      this.logger.warn('syncInitialData already in progress, skipping new call');
      return;
    }

    this.isSyncing = true;

    try {
      this.logger.log('🔄 Starting initial data synchronization...');

      // Sync IMEIs to Redis
      await this.SyncIMEIS();

      this.logger.log('✅ Initial data sync completed successfully');
    } catch (error) {
      this.logger.error(
        '❌ Error during initial data sync',
        (error as any)?.stack || String(error),
      );
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  async SyncIMEIS(): Promise<void> {
    const startedAt = Date.now();

    try {
      this.logger.log(
        `Starting IMEI sync (single batch) to Redis key "${this.DEVICE_IMEI_SET_KEY}"...`,
      );

      // 1) Fetch all IMEIs from DB
      const rows = await this.prisma.devices.findMany({
        select: {
          imei: true,
        },
      });

      if (!rows.length) {
        this.logger.warn(
          'No devices found in database. IMEI set in Redis will be empty.',
        );
        await this.redis.del(this.DEVICE_IMEI_SET_KEY);
        return;
      }

      // 2) Clean + normalize IMEIs
      const imeis: string[] = [];

      for (const row of rows) {
        let imei = row.imei;
        if (!imei) continue;

        imei = imei.trim();
        if (!imei) continue;

        // Optional: agar tumhare CommonService me IMEI validator ho to use it:
        // if (!this.commonService.isValidImei(imei)) continue;

        imeis.push(imei);
      }

      if (!imeis.length) {
        this.logger.warn(
          'No valid IMEIs after normalization. Clearing IMEI set in Redis.',
        );
        await this.redis.del(this.DEVICE_IMEI_SET_KEY);
        return;
      }

      // 3) Reset Redis key and add in one SADD call
      await this.redis.del(this.DEVICE_IMEI_SET_KEY);

      // NOTE: yahan “all at once” SADD ho raha hai, no batching/cursor
      await this.redis.sadd(this.DEVICE_IMEI_SET_KEY, ...imeis);

      const uniqueCount = await this.redis.scard(this.DEVICE_IMEI_SET_KEY);
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `✅ IMEI sync complete (single batch). Redis unique IMEIs=${uniqueCount}, duration=${durationMs}ms`,
      );
    } catch (error) {
      this.logger.error(
        '❌ Error during IMEI sync',
        (error as any)?.stack || String(error),
      );
      throw error;
    }
  }


  


}


