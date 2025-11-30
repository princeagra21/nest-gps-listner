import { Socket } from 'net';
import { Logger } from '@utils/logger';
import { 
  IProtocolDecoder, 
  DecodedPacket, 
  DeviceData, 
  PacketType 
} from './decoder.interface';

export abstract class BaseDecoder implements IProtocolDecoder {
  protected logger: Logger;
  abstract readonly protocolName: string;
  
  /**
   * Whether this protocol requires device validation from database
   * Set to false to bypass database validation and work in standalone mode
   */
  readonly requiresDeviceValidation: boolean = true;

  constructor() {
    this.logger = new Logger(`${this.constructor.name}`);
  }

  /**
   * Decode incoming data buffer - must be implemented by child classes
   */
  abstract decode(buffer: Buffer, socket: Socket): DecodedPacket | null;

  /**
   * Generate acknowledgment packet - must be implemented by child classes
   */
  abstract generateAck(packet: DecodedPacket): Buffer | null;

  /**
   * Transform decoded packet to standard device data format
   */
  abstract transformToDeviceData(packet: DecodedPacket): DeviceData | null;

  /**
   * Check if buffer contains a complete packet
   */
  abstract hasCompletePacket(buffer: Buffer): boolean;

  /**
   * Get the length of the next packet in buffer
   */
  abstract getPacketLength(buffer: Buffer): number;

  /**
   * Validate IMEI format
   */
  protected validateImei(imei: string): boolean {
    return /^\d{15}$/.test(imei);
  }

  /**
   * Convert hex string to IMEI
   */
  protected hexToImei(hex: string): string {
    return hex.replace(/^0+/, '');
  }

  /**
   * Calculate CRC16 checksum
   */
  protected calculateCrc16(buffer: Buffer, start: number, end: number): number {
    let crc = 0xffff;
    for (let i = start; i < end; i++) {
      crc ^= buffer[i] << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
      }
    }
    return crc & 0xffff;
  }

  /**
   * Convert GPS coordinates from protocol format to decimal degrees
   */
  protected parseCoordinate(value: number, hemisphere: string): number {
    const degrees = Math.floor(value / 100);
    const minutes = value - degrees * 100;
    let coordinate = degrees + minutes / 60;
    
    if (hemisphere === 'S' || hemisphere === 'W') {
      coordinate = -coordinate;
    }
    
    return coordinate;
  }

  /**
   * Validate GPS coordinates
   */
  protected isValidCoordinate(lat: number, lon: number): boolean {
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && 
           (lat !== 0 || lon !== 0);
  }

  /**
   * Convert BCD (Binary Coded Decimal) to number
   */
  protected bcdToNumber(buffer: Buffer, start: number, length: number): number {
    let result = 0;
    for (let i = 0; i < length; i++) {
      const byte = buffer[start + i];
      result = result * 100 + ((byte >> 4) * 10) + (byte & 0x0f);
    }
    return result;
  }

  /**
   * Log decoding error
   */
  protected logError(message: string, buffer: Buffer, error?: Error): void {
    this.logger.error(message, error?.stack, {
      protocol: this.protocolName,
      bufferHex: buffer.toString('hex'),
      bufferLength: buffer.length,
    });
  }

  /**
   * Log successful decode
   */
  protected logDecode(packet: DecodedPacket): void {
    this.logger.debug('Packet decoded successfully', {
      protocol: this.protocolName,
      type: packet.type,
      imei: packet.imei,
    });
  }
}
