import { Injectable } from '@nestjs/common';
// TODO: Generate Prisma models first by running: npm run prisma:pull && npm run prisma:generate
// import { Device } from '@prisma/client';
type Device = any; // Temporary placeholder until Prisma models are generated
import { DeviceRepository } from './device.repository';
import { Logger } from '@utils/logger';
import { metrics } from '@utils/metrics';

@Injectable()
export class DeviceService {
  private logger = new Logger(DeviceService.name);
  private deviceCache: Map<string, { device: Device | null; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(private deviceRepository: DeviceRepository) { }

  /**
   * Validate if device exists and is active
   */
  async validateDevice(imei: string): Promise<Device | null> {
    try {
      // Check cache first
      const cached = this.deviceCache.get(imei);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        metrics.deviceValidations.inc({ result: cached.device ? 'hit' : 'miss' });
        return cached.device;
      }

      // Query database
      const device = await this.deviceRepository.findActiveByImei(imei);

      // Update cache
      this.deviceCache.set(imei, {
        device,
        timestamp: Date.now(),
      });

      if (device) {
        metrics.deviceValidations.inc({ result: 'valid' });
        this.logger.debug(`Device validated: ${imei}`, { protocol: device.protocol });

        // Update last connect time asynchronously (fire and forget)
        this.deviceRepository.updateLastConnect(imei).catch((error) => {
          this.logger.error('Error updating last connect', error.stack, { imei });
        });
      } else {
        metrics.deviceValidations.inc({ result: 'invalid' });
        this.logger.warn(`Device not found or inactive: ${imei}`);
      }

      return device;
    } catch (error) {
      metrics.deviceValidationErrors.inc({ error_type: 'database_error' });
      this.logger.error('Error validating device', (error as Error).stack, { imei });
      return null;
    }
  }

  /**
   * Clear device from cache
   */
  clearCache(imei: string): void {
    this.deviceCache.delete(imei);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.deviceCache.clear();
    this.logger.log('Device cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.deviceCache.size,
      ttl: this.CACHE_TTL,
    };
  }
}
