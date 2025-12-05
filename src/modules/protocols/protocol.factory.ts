import { Injectable, Inject } from '@nestjs/common';
import { ExtendedLoggerService } from '@/modules/logger/logger.interface';
import { ConfigService } from '@nestjs/config';
import { IProtocolDecoder } from './base/decoder.interface';
import { GT06Service } from './gt06/gt06.service';
import { TeltonikaService } from './teltonika/teltonika.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { SocketWithMeta } from '@/types/socket-meta';

@Injectable()
export class ProtocolFactory {
  private decoderMap: Map<number, IProtocolDecoder> = new Map();

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: ExtendedLoggerService,
    private configService: ConfigService,
    private gt06Service: GT06Service,
    private teltonikaService: TeltonikaService,
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
      this.decoderMap.set(gt06Port, this.gt06Service);
      this.logger.log(`Registered GT06 service for port ${gt06Port}`);
    }

    if (teltonikaPort) {
      this.decoderMap.set(teltonikaPort, this.teltonikaService);
      this.logger.log(`Registered Teltonika service for port ${teltonikaPort}`);
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
   * Get process function by port number
   * Routes to the appropriate protocol service's processData method based on the configured port
   * @param port - Port number to get the process function for
   * @returns Process function that handles parsed data for the protocol, or null if not found
   */
  getProcessByPort(port: number): ((socket: SocketWithMeta, parsedData: any, port: number) => Promise<void>) | null {
    const gt06Port = this.configService.get<number>('app.ports.gt06');
    const teltonikaPort = this.configService.get<number>('app.ports.teltonika');

    if (port === gt06Port) {
      return async (socket: SocketWithMeta, parsedData: any, port: number) => {
        await this.gt06Service.processData(socket, parsedData, port);
      };
    }

    if (port === teltonikaPort) {
      return async (socket: SocketWithMeta, parsedData: any, port: number) => {
        await this.teltonikaService.processData(socket, parsedData, port);
      };
    }

    this.logger.warn(`No process function registered for port ${port}`);
    return null;
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

  /**
   * Send command to device based on socket port
   * Automatically identifies the protocol and encodes the command accordingly
   * @param socket - Socket with metadata containing port information
   * @param command - Command string to send
   * @returns Promise<boolean> - Success status of command sending
   */
  async sendCommand(socket: SocketWithMeta, command: string): Promise<boolean> {
    try {
      const port = socket.localPort;
      
      if (!port) {
        this.logger.error('Socket port not available for command sending');
        return false;
      }

      // Get the decoder/service for this port
      const decoder = this.decoderMap.get(port);
      
      if (!decoder) {
        this.logger.error(`No protocol service found for port ${port}`);
        return false;
      }

      // Check if the decoder has sendCommand method
      if (typeof (decoder as any).sendCommand !== 'function') {
        this.logger.error(`Protocol ${decoder.protocolName} does not support sendCommand`);
        return false;
      }

      // Call the protocol-specific sendCommand method
      this.logger.log(`Sending command via ${decoder.protocolName} protocol on port ${port}`);
      return await (decoder as any).sendCommand(socket, command);
      
    } catch (error) {
      this.logger.error('Failed to send command', (error as Error).message);
      return false;
    }
  }
}
