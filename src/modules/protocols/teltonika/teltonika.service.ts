import { Injectable, Inject } from '@nestjs/common';
import { Socket } from 'net';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ExtendedLoggerService } from '@/modules/logger/logger.interface';
import { BaseDecoder } from '../base/base-decoder.abstract';
import { DecodedPacket, PacketType, DeviceData, LocationData } from '../base/decoder.interface';
import { TeltonikaCodec, TeltonikaAVLRecord, TeltonikaPacket } from './teltonika.types';
import { SocketWithMeta } from '@/types/socket-meta';
import { CommonService } from '@/modules/common/common.service';
import { DataForwarderService } from '@/modules/data-forwarder/data-forwarder.service';

@Injectable()
export class TeltonikaService extends BaseDecoder {
  readonly protocolName = 'Teltonika';
  readonly requiresDeviceValidation = true;

  private static readonly MIN_PACKET_LENGTH = 17;
  private static readonly IMEI_LENGTH = 15;
  private static readonly IMEI_PACKET_LENGTH = 17; // 2 bytes length + 15 bytes IMEI

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    logger: ExtendedLoggerService,
    private readonly dataForwarder: DataForwarderService,
    private readonly commonService: CommonService,
  ) {
    super(logger);
  }

  /**
   * Check if buffer contains a complete Teltonika packet
   */
  hasCompletePacket(buffer: Buffer): boolean {
    if (buffer.length < 2) {
      return false;
    }

    // Check if this is IMEI packet
    const firstTwoBytes = buffer.readUInt16BE(0);
    if (firstTwoBytes === TeltonikaService.IMEI_LENGTH && buffer.length >= TeltonikaService.IMEI_PACKET_LENGTH) {
      return true;
    }

    // Check for AVL data packet (starts with 4 zero bytes as preamble)
    if (buffer.length < 8) {
      return false;
    }

    const packetLength = this.getPacketLength(buffer);
    return packetLength > 0 && buffer.length >= packetLength;
  }

  /**
   * Get the length of the next packet in buffer
   */
  getPacketLength(buffer: Buffer): number {
    if (buffer.length < 2) {
      return 0;
    }

    // Check if IMEI packet
    const firstTwoBytes = buffer.readUInt16BE(0);
    if (firstTwoBytes === TeltonikaService.IMEI_LENGTH) {
      return TeltonikaService.IMEI_PACKET_LENGTH;
    }

    // AVL data packet: 4 bytes preamble + 4 bytes data length + data + 4 bytes CRC
    if (buffer.length < 8) {
      return 0;
    }

    const preamble = buffer.readUInt32BE(0);
    if (preamble !== 0x00000000) {
      return 0;
    }

    const dataLength = buffer.readUInt32BE(4);
    return 8 + dataLength + 4; // preamble(4) + length(4) + data + crc(4)
  }

  /**
   * Decode Teltonika protocol packet
   */
  decode(buffer: Buffer, socket: SocketWithMeta): DecodedPacket | null {
    try {
      // Check if this is an IMEI packet
      const firstTwoBytes = buffer.readUInt16BE(0);
      if (firstTwoBytes === TeltonikaService.IMEI_LENGTH) {
        return this.decodeImeiPacket(buffer);
      }

      // Otherwise, decode as AVL data packet
      return this.decodeAvlPacket(buffer, socket);
    } catch (error) {
      this.logError('Failed to decode Teltonika packet', buffer, error as Error);
      return null;
    }
  }

  /**
   * Decode IMEI packet
   */
  private decodeImeiPacket(buffer: Buffer): DecodedPacket {
    const imeiLength = buffer.readUInt16BE(0);
    const imei = buffer.slice(2, 2 + imeiLength).toString('utf8');

    this.logger.debug(`Decoded Teltonika IMEI: ${imei}`);

    return {
      type: PacketType.LOGIN,
      imei,
      raw: buffer,
      requiresAck: true,
      timestamp: new Date(),
      data: {
        imeiLength,
      },
    };
  }

  /**
   * Decode AVL data packet
   */
  private decodeAvlPacket(buffer: Buffer, socket: SocketWithMeta): DecodedPacket | null {
    let offset = 0;

    // Skip preamble (4 bytes)
    const preamble = buffer.readUInt32BE(offset);
    if (preamble !== 0x00000000) {
      this.logger.warn('Invalid Teltonika packet preamble');
      return null;
    }
    offset += 4;

    // Data length (4 bytes)
    const dataLength = buffer.readUInt32BE(offset);
    offset += 4;

    // Codec ID (1 byte)
    const codecId = buffer[offset];
    offset += 1;

    // Number of records (1 byte)
    const recordCount = buffer[offset];
    offset += 1;

    const records: TeltonikaAVLRecord[] = [];

    // Parse each AVL record
    for (let i = 0; i < recordCount; i++) {
      const record = this.parseAvlRecord(buffer, offset, codecId);
      if (record) {
        records.push(record.data);
        offset = record.newOffset;
      }
    }

    // Number of records (1 byte) - should match recordCount
    const recordCount2 = buffer[offset];
    offset += 1;

    if (recordCount !== recordCount2) {
      this.logger.warn(`Record count mismatch: ${recordCount} vs ${recordCount2}`);
    }

    // CRC (4 bytes)
    const crc = buffer.readUInt32BE(offset);
    offset += 4;

    // Validate CRC
    const calculatedCrc = this.calculateCrc16(buffer, 8, offset - 4);
    if (crc !== calculatedCrc) {
      this.logger.warn('CRC mismatch in Teltonika packet');
    }

    // Determine packet type based on records
    let packetType = PacketType.LOCATION;
    if (records.length === 0) {
      packetType = PacketType.HEARTBEAT;
    }

    const decodedPacket: DecodedPacket = {
      type: packetType,
      imei: socket.meta?.imei, // IMEI should be set from previous LOGIN packet
      raw: buffer,
      requiresAck: true,
      timestamp: records.length > 0 ? records[0].timestamp : new Date(),
      data: {
        codecId,
        recordCount,
        records,
      } as TeltonikaPacket,
    };

    this.logDecode(decodedPacket);

    return decodedPacket;
  }

  /**
   * Parse single AVL record
   */
  private parseAvlRecord(
    buffer: Buffer,
    offset: number,
    codecId: number,
  ): { data: TeltonikaAVLRecord; newOffset: number } | null {
    try {
      let currentOffset = offset;

      // Timestamp (8 bytes, milliseconds since 1970-01-01)
      const timestampMs = buffer.readBigUInt64BE(currentOffset);
      const timestamp = new Date(Number(timestampMs));
      currentOffset += 8;

      // Priority (1 byte)
      const priority = buffer[currentOffset];
      currentOffset += 1;

      // GPS data
      // Longitude (4 bytes, signed)
      const longitude = buffer.readInt32BE(currentOffset) / 10000000.0;
      currentOffset += 4;

      // Latitude (4 bytes, signed)
      const latitude = buffer.readInt32BE(currentOffset) / 10000000.0;
      currentOffset += 4;

      // Altitude (2 bytes, signed, meters)
      const altitude = buffer.readInt16BE(currentOffset);
      currentOffset += 2;

      // Angle (2 bytes, degrees)
      const angle = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;

      // Satellites (1 byte)
      const satellites = buffer[currentOffset];
      currentOffset += 1;

      // Speed (2 bytes, km/h)
      const speed = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;

      // IO Elements
      const ioElements = new Map<number, any>();

      // Event IO ID (1 byte)
      const eventId = buffer[currentOffset];
      currentOffset += 1;

      // Total IO elements (1 byte)
      const totalIoElements = buffer[currentOffset];
      currentOffset += 1;

      // Parse IO elements based on codec
      if (codecId === TeltonikaCodec.CODEC_8 || codecId === TeltonikaCodec.CODEC_8_EXT) {
        const ioResult = this.parseIoElements(buffer, currentOffset);
        ioResult.elements.forEach((value, key) => ioElements.set(key, value));
        currentOffset = ioResult.newOffset;
      }

      const record: TeltonikaAVLRecord = {
        timestamp,
        priority,
        longitude,
        latitude,
        altitude,
        angle,
        satellites,
        speed,
        eventId,
        ioElements,
      };

      return { data: record, newOffset: currentOffset };
    } catch (error) {
      this.logger.error('Failed to parse AVL record', (error as Error).stack);
      return null;
    }
  }

  /**
   * Parse IO elements
   */
  private parseIoElements(
    buffer: Buffer,
    offset: number,
  ): { elements: Map<number, any>; newOffset: number } {
    const elements = new Map<number, any>();
    let currentOffset = offset;

    // 1-byte IO elements
    const count1Byte = buffer[currentOffset];
    currentOffset += 1;
    for (let i = 0; i < count1Byte; i++) {
      const ioId = buffer[currentOffset];
      currentOffset += 1;
      const value = buffer[currentOffset];
      currentOffset += 1;
      elements.set(ioId, value);
    }

    // 2-byte IO elements
    const count2Byte = buffer[currentOffset];
    currentOffset += 1;
    for (let i = 0; i < count2Byte; i++) {
      const ioId = buffer[currentOffset];
      currentOffset += 1;
      const value = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;
      elements.set(ioId, value);
    }

    // 4-byte IO elements
    const count4Byte = buffer[currentOffset];
    currentOffset += 1;
    for (let i = 0; i < count4Byte; i++) {
      const ioId = buffer[currentOffset];
      currentOffset += 1;
      const value = buffer.readUInt32BE(currentOffset);
      currentOffset += 4;
      elements.set(ioId, value);
    }

    // 8-byte IO elements
    const count8Byte = buffer[currentOffset];
    currentOffset += 1;
    for (let i = 0; i < count8Byte; i++) {
      const ioId = buffer[currentOffset];
      currentOffset += 1;
      const value = buffer.readBigUInt64BE(currentOffset);
      currentOffset += 8;
      elements.set(ioId, value);
    }

    return { elements, newOffset: currentOffset };
  }

  /**
   * Generate acknowledgment packet for Teltonika
   */
  generateAck(packet: DecodedPacket): Buffer | null {
    try {
      // For IMEI packet, send 0x01 (accept)
      if (packet.type === PacketType.LOGIN) {
        const ackBuffer = Buffer.from([0x01]);
        this.logger.debug('Generated Teltonika IMEI ACK');
        return ackBuffer;
      }

      // For AVL data packet, send number of records accepted
      const teltonikaData = packet.data as TeltonikaPacket;
      if (teltonikaData && teltonikaData.recordCount !== undefined) {
        const ackBuffer = Buffer.alloc(4);
        ackBuffer.writeUInt32BE(teltonikaData.recordCount, 0);
        
        this.logger.debug(`Generated Teltonika AVL ACK for ${teltonikaData.recordCount} records`);
        return ackBuffer;
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to generate ACK', (error as Error).stack);
      return null;
    }
  }

  /**
   * Transform decoded packet to standard device data format
   */
  transformToDeviceData(packet: DecodedPacket): DeviceData | null {
    if (!packet.imei) {
      return null;
    }

    const deviceData: DeviceData = {
      imei: packet.imei,
      protocol: this.protocolName,
      packetType: packet.type,
      timestamp: packet.timestamp || new Date(),
      raw: packet.raw.toString('hex'),
    };

    // Add location data if present
    if (packet.type === PacketType.LOCATION) {
      const teltonikaData = packet.data as TeltonikaPacket;
      if (teltonikaData && teltonikaData.records && teltonikaData.records.length > 0) {
        const record = teltonikaData.records[0]; // Use first record
        
        const isValid = this.isValidCoordinate(record.latitude, record.longitude);
        
        deviceData.location = {
          latitude: record.latitude,
          longitude: record.longitude,
          altitude: record.altitude,
          speed: record.speed,
          course: record.angle,
          satellites: record.satellites,
          timestamp: record.timestamp,
          valid: isValid,
        } as LocationData;

        // Add IO elements as sensors
        if (record.ioElements.size > 0) {
          deviceData.sensors = {};
          record.ioElements.forEach((value, key) => {
            deviceData.sensors![`io_${key}`] = value;
          });
        }
      }
    }

    return deviceData;
  }

  /**
   * Process Teltonika data - Main orchestration method
   * This is called from tcp-server after decoding
   */
  async processData(
    socket: SocketWithMeta,
    parsedData: { packetsProcessed: number; packetTypes: string[]; deviceData: any[] },
    port: number,
  ): Promise<void> {
    try {
      this.logger.debug(`Processing ${parsedData.packetsProcessed} Teltonika packets`, {
        types: parsedData.packetTypes,
        imei: socket.meta?.imei,
      });

      // Process each device data packet
      for (const deviceData of parsedData.deviceData) {
        if (deviceData) {
          // Log successful processing
          this.logger.log(`📍 Teltonika data processed for device ${deviceData.imei}`, {
            type: deviceData.packetType,
            hasLocation: !!deviceData.location,
          });

          // Here you can add additional processing like:
          // - Forwarding to external API
          // - Storing in database
          // - Publishing to message queue
          // These would be injected services
        }
      }
    } catch (error) {
      this.logger.error('Error processing Teltonika data', (error as Error).stack);
    }
  }

  /**
   * Encode command to send to Teltonika device
   */
  encodeCommand(command: string, codecId: number = TeltonikaCodec.CODEC_12): Buffer | null {
    try {
      // Teltonika command format using Codec 12
      // Structure: Preamble(4) + Data Length(4) + Codec ID(1) + Quantity(1) + 
      //            Command Type(1) + Command Size(4) + Command + Quantity(1) + CRC(4)
      
      const commandBytes = Buffer.from(command, 'utf8');
      const commandSize = commandBytes.length;
      
      // Calculate data length: Codec(1) + Qty1(1) + Type(1) + Size(4) + Command + Qty2(1)
      const dataLength = 1 + 1 + 1 + 4 + commandSize + 1;
      
      const buffer = Buffer.alloc(8 + dataLength + 4); // Preamble + Length + Data + CRC
      let offset = 0;

      // Preamble (4 zero bytes)
      buffer.writeUInt32BE(0x00000000, offset);
      offset += 4;

      // Data length
      buffer.writeUInt32BE(dataLength, offset);
      offset += 4;

      // Codec ID
      buffer[offset] = codecId;
      offset += 1;

      // Quantity of commands (1)
      buffer[offset] = 0x01;
      offset += 1;

      // Command type (0x05 for text command)
      buffer[offset] = 0x05;
      offset += 1;

      // Command size
      buffer.writeUInt32BE(commandSize, offset);
      offset += 4;

      // Command content
      commandBytes.copy(buffer, offset);
      offset += commandSize;

      // Quantity of commands (1)
      buffer[offset] = 0x01;
      offset += 1;

      // CRC (CRC-16 of data)
      const crc = this.calculateCrc16(buffer, 8, offset);
      buffer.writeUInt32BE(crc, offset);

      this.logger.debug(`Encoded Teltonika command: ${command}`, {
        hex: buffer.toString('hex'),
      });

      return buffer;
    } catch (error) {
      this.logger.error('Failed to encode command', (error as Error).stack);
      return null;
    }
  }

  /**
   * Send command to Teltonika device
   */
  async sendCommand(socket: Socket, command: string): Promise<boolean> {
    try {
      const commandBuffer = this.encodeCommand(command);
      if (!commandBuffer) {
        return false;
      }

      return new Promise((resolve) => {
        socket.write(commandBuffer, (error) => {
          if (error) {
            this.logger.error('Failed to send command', error.message);
            resolve(false);
          } else {
            this.logger.log(`✅ Command sent to Teltonika device: ${command}`);
            resolve(true);
          }
        });
      });
    } catch (error) {
      this.logger.error('Error sending command', (error as Error).stack);
      return false;
    }
  }
}
