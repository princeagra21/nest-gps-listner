import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IProtocolDecoder } from './base/decoder.interface';
import { GT06Decoder } from './gt06/gt06.decoder';
import { TeltonikaDecoder } from './teltonika/teltonika.decoder';
import { Logger } from '@utils/logger';

@Injectable()
export class ProtocolFactory {
  private logger = new Logger(ProtocolFactory.name);
  private decoderMap: Map<number, IProtocolDecoder> = new Map();

  constructor(
    private configService: ConfigService,
    private gt06Decoder: GT06Decoder,
    private teltonikaDecoder: TeltonikaDecoder,
  ) {
    this.initializeDecoders();
  }

  /**
   * Initialize decoder mappings based on port configuration
   */
  private initializeDecoders() {
    const gt06Port = this.configService.get<number>('app.ports.gt06');
    const teltonikaPort = this.configService.get<number>('app.ports.teltonika');

    if (gt06Port) {
      this.decoderMap.set(gt06Port, this.gt06Decoder);
      this.logger.log(`Registered GT06 decoder for port ${gt06Port}`);
    }

    if (teltonikaPort) {
      this.decoderMap.set(teltonikaPort, this.teltonikaDecoder);
      this.logger.log(`Registered Teltonika decoder for port ${teltonikaPort}`);
    }
  }

  /**
   * Get decoder by port number
   */
  getDecoderByPort(port: number): IProtocolDecoder | null {
    const decoder = this.decoderMap.get(port);
    
    if (!decoder) {
      this.logger.warn(`No decoder registered for port ${port}`);
      return null;
    }

    return decoder;
  }

  /**
   * Get all configured ports
   */
  getAllPorts(): number[] {
    return Array.from(this.decoderMap.keys());
  }

  /**
   * Get protocol name by port
   */
  getProtocolNameByPort(port: number): string | null {
    const decoder = this.decoderMap.get(port);
    return decoder ? decoder.protocolName : null;
  }
}
