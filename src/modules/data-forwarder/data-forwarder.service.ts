import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@utils/logger';
import { metrics } from '@utils/metrics';
import { DeviceData } from '../protocols/base/decoder.interface';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { of } from 'rxjs';

@Injectable()
export class DataForwarderService {
  private logger = new Logger(DataForwarderService.name);
  private forwardUrl: string;
  private readonly TIMEOUT = 5000; // 5 seconds timeout

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.forwardUrl = this.configService.get<string>('app.dataForward.url')!;
  }

  /**
   * Forward device data to external endpoint
   * This is fire-and-forget - we don't wait for response
   */
  async forwardData(deviceData: DeviceData): Promise<void> {
    // Fire and forget - don't await
    this.sendData(deviceData);
  }

  /**
   * Internal method to send data
   */
  private async sendData(deviceData: DeviceData): Promise<void> {
    const startTime = Date.now();

    try {
      const observable = this.httpService.post(this.forwardUrl, deviceData, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: this.TIMEOUT,
      }).pipe(
        timeout(this.TIMEOUT),
        catchError((error) => {
          // Log error but don't throw
          this.logger.error('Error forwarding data', error.message, {
            imei: deviceData.imei,
            url: this.forwardUrl,
          });
          metrics.dataForwardFailure.inc({ 
            error_type: error.code || 'unknown' 
          });
          return of(null);
        }),
      );

      // We use firstValueFrom but don't await it in the parent
      await firstValueFrom(observable);

      const duration = (Date.now() - startTime) / 1000;
      metrics.dataForwardSuccess.inc();
      metrics.dataForwardDuration.observe(duration);

      this.logger.debug('Data forwarded successfully', {
        imei: deviceData.imei,
        duration,
      });
    } catch (error) {
      // This catch is for any unexpected errors
      const duration = (Date.now() - startTime) / 1000;
      metrics.dataForwardFailure.inc({ error_type: 'unexpected' });
      metrics.dataForwardDuration.observe(duration);

      this.logger.error('Unexpected error forwarding data', (error as Error).stack, {
        imei: deviceData.imei,
      });
    }
  }

  /**
   * Forward data with retry logic (optional method for critical data)
   */
  async forwardDataWithRetry(
    deviceData: DeviceData,
    maxRetries: number = 3,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const observable = this.httpService.post(this.forwardUrl, deviceData, {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.TIMEOUT,
        }).pipe(timeout(this.TIMEOUT));

        await firstValueFrom(observable);
        
        metrics.dataForwardSuccess.inc();
        this.logger.debug(`Data forwarded on attempt ${attempt}`, {
          imei: deviceData.imei,
        });
        
        return true;
      } catch (error) {
        this.logger.warn(
          `Forward attempt ${attempt}/${maxRetries} failed`,
          { imei: deviceData.imei, error: (error as Error).message },
        );

        if (attempt === maxRetries) {
          metrics.dataForwardFailure.inc({ error_type: 'max_retries' });
          return false;
        }

        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }

    return false;
  }

  /**
   * Health check for forward endpoint
   */
  async checkEndpointHealth(): Promise<boolean> {
    try {
      const observable = this.httpService.get(this.forwardUrl.replace('/gpsdata', '/health'), {
        timeout: 2000,
      }).pipe(
        timeout(2000),
        catchError(() => of(null)),
      );

      const response = await firstValueFrom(observable);
      return response !== null;
    } catch {
      return false;
    }
  }
}
