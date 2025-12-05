import { Injectable, Inject } from '@nestjs/common';
import { ExtendedLoggerService } from '@/modules/logger/logger.interface';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DeviceData } from '../protocols/base/decoder.interface';



@Injectable()
export class DataForwarderService {
  private forwardUrl: string;
  private readonly TIMEOUT = 5000; // 5 seconds timeout

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: ExtendedLoggerService,
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
