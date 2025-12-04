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

  forwardData(deviceData: DeviceData): void {
    this.httpService.post(this.forwardUrl, deviceData).subscribe({
      error: () => {} // Silently ignore errors
    });
  }
}
