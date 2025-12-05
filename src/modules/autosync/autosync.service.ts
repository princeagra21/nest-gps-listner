import { Injectable, Logger, OnApplicationBootstrap, BeforeApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    private readonly DEVICE_IMEI_SET_KEY: string;
    private readonly DEVICE_STATUS_HASH_KEY: string;
    private readonly COMMAND_QUEUE_KEY_PREFIX: string;

    constructor(
        private readonly commonService: CommonService,
        private readonly connectionManager: ConnectionManagerService,
        private readonly prisma: PrismaService,
        private readonly configService: ConfigService,
    ) {
        // Initialize Redis keys from global configuration
       // const redisKeys = this.configService.get('app.rediskeys');
        this.DEVICE_IMEI_SET_KEY = this.configService.get('app.rediskeys.deviceImeiSet') as string;
        this.DEVICE_STATUS_HASH_KEY = this.configService.get('app.rediskeys.deviceStatusHash') as string;
        this.COMMAND_QUEUE_KEY_PREFIX = this.configService.get('app.rediskeys.commandQueuePrefix') as string;
    }

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
        this.logger.debug('⏱ 5-minute interval sync triggered');
        
        // Sync data bidirectionally
        this.SyncIMEIS();
        this.syncCommandQueueToRedis();
        this.syncDeviceStatusToPrisma();
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
    // getRedisClient(): Redis {
    //     return this.redis;
    // }

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
            await this.syncDeviceStatusToRedis();
            await this.syncCommandQueueToRedis();

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
            const rows = await this.prisma.device.findMany({
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



    private async syncDeviceStatusToRedis(): Promise<void> {
        this.logger.log(
            `Syncing DeviceStatus to Redis HASH "${this.DEVICE_STATUS_HASH_KEY}"...`,
        );



        const rows = await this.prisma.deviceStatus.findMany({
            select: {
                imei: true,
                status: true,
                lat: true,
                lon: true,
                speed: true,
                course: true,
                acc: true,
                satellites: true,
                updatedAt: true,
            },
        });

        // Clear old data
        await this.redis.del(this.DEVICE_STATUS_HASH_KEY);

        if (!rows.length) {
            this.logger.warn(
                'No DeviceStatus rows found. Redis devices:status will be empty.',
            );
            return;
        }

        // Build arguments for HSET: [imei1, json1, imei2, json2, ...]
        const hsetArgs: string[] = [];

        for (const row of rows) {
            if (!row.imei) continue;

            const imei = row.imei.trim();
            if (!imei) continue;

            const value = JSON.stringify({
                status: row.status, // e.g. "CONNECTED" | "DISCONNECTED"
                lat: row.lat,
                lon: row.lon,
                speed: row.speed,
                course: row.course,
                acc: row.acc,
                satellites: row.satellites,
                updatedAt: row.updatedAt.toISOString(),
            });

            hsetArgs.push(imei, value);
        }

        if (hsetArgs.length === 0) {
            this.logger.warn(
                'No valid DeviceStatus records after normalization.',
            );
            return;
        }

        // Single HSET command with multiple fields (all at once)
        await this.redis.hset(this.DEVICE_STATUS_HASH_KEY, ...hsetArgs);

        const count = await this.redis.hlen(this.DEVICE_STATUS_HASH_KEY);
        this.logger.log(
            `✅ DeviceStatus sync done. Redis devices:status count=${count}`,
        );
    }


    async syncCommandQueueToRedis(): Promise<void> {
        this.logger.log(
            'Starting CommandQueue sync from PostgreSQL to Redis (grouped by IMEI)...',
        );

        // 1) Load all command queue rows, oldest first
        const rows = await this.prisma.commandQueue.findMany({
            select: {
                id: true,
                imei: true,
                command: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        if (!rows.length) {
            this.logger.warn('No CommandQueue rows found. Clearing all command keys.');
            // Optional: if you track all imeis somewhere, you can delete those keys.
            // For now we just log and return.
            return;
        }

        const pipeline = this.redis.pipeline();

        // 2) Collect unique IMEIs to clear existing per-device lists
        const imeiSet = new Set<string>();

        for (const row of rows) {
            if (!row.imei) continue;
            const imei = row.imei.trim();
            if (!imei) continue;
            imeiSet.add(imei);
        }

        // 3) Clear old Redis lists for those IMEIs
        for (const imei of imeiSet) {
            const key = `${this.COMMAND_QUEUE_KEY_PREFIX}${imei}`;
            pipeline.del(key);
        }

        // 4) Re-fill lists with commands (RPUSH -> oldest first, newest last)
        for (const row of rows) {
            const imei = row.imei?.trim();
            if (!imei) continue;

            const key = `${this.COMMAND_QUEUE_KEY_PREFIX}${imei}`;

            const payload = JSON.stringify({
                id: row.id.toString(),               // BigInt → string for JSON safety
                command: row.command,
                createdAt: row.createdAt.toISOString(),
            });

            pipeline.rpush(key, payload);
        }

        await pipeline.exec();

        this.logger.log(
            `✅ CommandQueue sync complete. IMEIs affected=${imeiSet.size}`,
        );
    }

    async syncDeviceStatusToPrisma(): Promise<void> {
        this.logger.log(
            `Syncing DeviceStatus from Redis HASH "${this.DEVICE_STATUS_HASH_KEY}" to PostgreSQL...`,
        );

        try {
            // 1) Get all device status data from Redis hash
            const allData = await this.redis.hgetall(this.DEVICE_STATUS_HASH_KEY);

            if (!allData || Object.keys(allData).length === 0) {
                this.logger.warn(
                    'No DeviceStatus data found in Redis. Nothing to sync to Prisma.',
                );
                return;
            }

            const imeis = Object.keys(allData);
            this.logger.log(`Found ${imeis.length} device status records in Redis`);

            let successCount = 0;
            let errorCount = 0;

            // 2) Process each IMEI and upsert to database
            for (const imei of imeis) {
                try {
                    const jsonData = allData[imei];
                    if (!jsonData) continue;

                    // Parse the JSON data from Redis
                    const statusData = JSON.parse(jsonData);

                    // 3) Upsert to DeviceStatus table
                    await this.prisma.deviceStatus.upsert({
                        where: {
                            imei: imei,
                        },
                        update: {
                            status: statusData.status,
                            lat: statusData.lat !== null && statusData.lat !== undefined 
                                ? parseFloat(statusData.lat) 
                                : null,
                            lon: statusData.lon !== null && statusData.lon !== undefined 
                                ? parseFloat(statusData.lon) 
                                : null,
                            speed: statusData.speed !== null && statusData.speed !== undefined 
                                ? parseFloat(statusData.speed) 
                                : null,
                            course: statusData.course !== null && statusData.course !== undefined 
                                ? parseFloat(statusData.course) 
                                : null,
                            acc: statusData.acc !== null && statusData.acc !== undefined 
                                ? Boolean(statusData.acc) 
                                : null,
                            satellites: statusData.satellites !== null && statusData.satellites !== undefined 
                                ? parseInt(statusData.satellites) 
                                : null,
                        },
                        create: {
                            imei: imei,
                            status: statusData.status || 'DISCONNECTED',
                            lat: statusData.lat !== null && statusData.lat !== undefined 
                                ? parseFloat(statusData.lat) 
                                : null,
                            lon: statusData.lon !== null && statusData.lon !== undefined 
                                ? parseFloat(statusData.lon) 
                                : null,
                            speed: statusData.speed !== null && statusData.speed !== undefined 
                                ? parseFloat(statusData.speed) 
                                : null,
                            course: statusData.course !== null && statusData.course !== undefined 
                                ? parseFloat(statusData.course) 
                                : null,
                            acc: statusData.acc !== null && statusData.acc !== undefined 
                                ? Boolean(statusData.acc) 
                                : null,
                            satellites: statusData.satellites !== null && statusData.satellites !== undefined 
                                ? parseInt(statusData.satellites) 
                                : null,
                        },
                    });

                    successCount++;
                } catch (error) {
                    errorCount++;
                    this.logger.error(
                        `Failed to sync status for IMEI ${imei}`,
                        (error as Error).stack,
                        { imei },
                    );
                }
            }

            this.logger.log(
                `✅ DeviceStatus sync from Redis to Prisma complete. Success=${successCount}, Errors=${errorCount}`,
            );
        } catch (error) {
            this.logger.error(
                '❌ Error during DeviceStatus sync from Redis to Prisma',
                (error as any)?.stack || String(error),
            );
            throw error;
        }
    }



}


