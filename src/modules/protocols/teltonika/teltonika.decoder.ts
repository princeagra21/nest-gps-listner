import { Socket } from 'net';
import { Injectable } from '@nestjs/common';
import { BaseDecoder } from '../base/base-decoder.abstract';
import { DecodedPacket, PacketType, DeviceData } from '../base/decoder.interface';
import { TeltonikaCodec, TeltonikaAVLRecord } from './teltonika.types';

@Injectable()
export class TeltonikaDecoder extends BaseDecoder {
  readonly protocolName = 'Teltonika';
  private imeiMap: Map<string, string> = new Map(); // socket -> imei mapping

  /**
   * Check if buffer contains a complete Teltonika packet
   */
  hasCompletePacket(buffer: Buffer): boolean {
    // IMEI packet (first packet)
    if (buffer.length >= 2) {
      const imeiLength = buffer.readUInt16BE(0);
      if (imeiLength === 15) {
        return buffer.length >= imeiLength + 2;
      }
    }

    // AVL Data packet
    if (buffer.length >= 8) {
      const preamble = buffer.readUInt32BE(0);
      if (preamble === 0) {
        const dataLength = buffer.readUInt32BE(4);
        return buffer.length >= dataLength + 12; // preamble(4) + length(4) + data + crc(4)
      }
    }

    return false;
  }

  /**
   * Get the length of the next packet in buffer
   */
  getPacketLength(buffer: Buffer): number {
    if (buffer.length < 2) {
      return 0;
    }

    // Check for IMEI packet
    const imeiLength = buffer.readUInt16BE(0);
    if (imeiLength === 15) {
      return imeiLength + 2;
    }

    // Check for AVL Data packet
    if (buffer.length >= 8) {
      const preamble = buffer.readUInt32BE(0);
      if (preamble === 0) {
        const dataLength = buffer.readUInt32BE(4);
        return dataLength + 12;
      }
    }

    return 0;
  }

  /**
   * Decode Teltonika packet
   */
  decode(buffer: Buffer, socket: Socket): DecodedPacket | null {
    try {
      if (!this.hasCompletePacket(buffer)) {
        return null;
      }

      // Check if this is an IMEI packet
      const imeiLength = buffer.readUInt16BE(0);
      if (imeiLength === 15) {
        return this.decodeImeiPacket(buffer, socket);
      }

      // AVL Data packet
      const preamble = buffer.readUInt32BE(0);
      if (preamble === 0) {
        return this.decodeAVLPacket(buffer, socket);
      }

      return null;
    } catch (error) {
      this.logError('Error decoding Teltonika packet', buffer, error as Error);
      return null;
    }
  }

  /**
   * Decode IMEI packet
   */
  private decodeImeiPacket(buffer: Buffer, socket: Socket): DecodedPacket {
    const imeiLength = buffer.readUInt16BE(0);
    const imei = buffer.toString('utf8', 2, 2 + imeiLength);
    
    // Store IMEI for this socket
    const socketKey = `${socket.remoteAddress}:${socket.remotePort}`;
    this.imeiMap.set(socketKey, imei);

    this.logger.debug(`Teltonika IMEI received: ${imei}`);

    return {
      type: PacketType.LOGIN,
      imei,
      raw: buffer,
      requiresAck: true,
      timestamp: new Date(),
    };
  }

  /**
   * Decode AVL Data packet
   */
  private decodeAVLPacket(buffer: Buffer, socket: Socket): DecodedPacket | null {
    const socketKey = `${socket.remoteAddress}:${socket.remotePort}`;
    const imei = this.imeiMap.get(socketKey);

    if (!imei) {
      this.logger.warn('Received AVL packet without IMEI');
      return null;
    }

    let offset = 8; // Skip preamble(4) + data length(4)
    
    const codecId = buffer.readUInt8(offset);
    offset += 1;

    const recordCount = buffer.readUInt8(offset);
    offset += 1;

    const records: TeltonikaAVLRecord[] = [];

    for (let i = 0; i < recordCount; i++) {
      const record = this.parseAVLRecord(buffer, offset, codecId);
      if (record) {
        records.push(record.data);
        offset = record.offset;
      }
    }

    return {
      type: PacketType.LOCATION,
      imei,
      data: { records, codecId },
      raw: buffer,
      requiresAck: true,
      timestamp: records[0]?.timestamp || new Date(),
    };
  }

  /**
   * Parse single AVL record
   */
  private parseAVLRecord(
    buffer: Buffer,
    offset: number,
    codecId: number,
  ): { data: TeltonikaAVLRecord; offset: number } | null {
    try {
      // Parse timestamp (8 bytes, milliseconds since 1970-01-01)
      const timestampMs = Number(buffer.readBigInt64BE(offset));
      const timestamp = new Date(timestampMs);
      offset += 8;

      // Priority
      const priority = buffer.readUInt8(offset);
      offset += 1;

      // GPS Element
      const longitude = buffer.readInt32BE(offset) / 10000000;
      offset += 4;

      const latitude = buffer.readInt32BE(offset) / 10000000;
      offset += 4;

      const altitude = buffer.readInt16BE(offset);
      offset += 2;

      const angle = buffer.readUInt16BE(offset);
      offset += 2;

      const satellites = buffer.readUInt8(offset);
      offset += 1;

      const speed = buffer.readUInt16BE(offset);
      offset += 2;

      // Parse IO Elements based on codec
      const ioData = this.parseIOElements(buffer, offset, codecId);
      offset = ioData.offset;

      const record: TeltonikaAVLRecord = {
        timestamp,
        priority,
        longitude,
        latitude,
        altitude,
        angle,
        satellites,
        speed,
        eventId: ioData.eventId,
        ioElements: ioData.elements,
      };

      return { data: record, offset };
    } catch (error) {
      this.logger.error('Error parsing AVL record', (error as Error).stack);
      return null;
    }
  }

  /**
   * Parse IO Elements
   */
  private parseIOElements(
    buffer: Buffer,
    offset: number,
    codecId: number,
  ): { eventId: number; elements: Map<number, any>; offset: number } {
    const elements = new Map<number, any>();
    
    const eventId = buffer.readUInt8(offset);
    offset += 1;

    const totalElements = buffer.readUInt8(offset);
    offset += 1;

    // 1 byte IO elements
    const count1 = buffer.readUInt8(offset);
    offset += 1;
    for (let i = 0; i < count1; i++) {
      const id = buffer.readUInt8(offset);
      offset += 1;
      const value = buffer.readUInt8(offset);
      offset += 1;
      elements.set(id, value);
    }

    // 2 byte IO elements
    const count2 = buffer.readUInt8(offset);
    offset += 1;
    for (let i = 0; i < count2; i++) {
      const id = buffer.readUInt8(offset);
      offset += 1;
      const value = buffer.readUInt16BE(offset);
      offset += 2;
      elements.set(id, value);
    }

    // 4 byte IO elements
    const count4 = buffer.readUInt8(offset);
    offset += 1;
    for (let i = 0; i < count4; i++) {
      const id = buffer.readUInt8(offset);
      offset += 1;
      const value = buffer.readUInt32BE(offset);
      offset += 4;
      elements.set(id, value);
    }

    // 8 byte IO elements
    const count8 = buffer.readUInt8(offset);
    offset += 1;
    for (let i = 0; i < count8; i++) {
      const id = buffer.readUInt8(offset);
      offset += 1;
      const value = buffer.readBigInt64BE(offset);
      offset += 8;
      elements.set(id, value);
    }

    return { eventId, elements, offset };
  }

  /**
   * Generate acknowledgment packet
   */
  generateAck(packet: DecodedPacket): Buffer | null {
    if (!packet.requiresAck) {
      return null;
    }

    if (packet.type === PacketType.LOGIN) {
      // ACK for IMEI packet: 0x01
      return Buffer.from([0x01]);
    }

    if (packet.type === PacketType.LOCATION) {
      // ACK for AVL packet: 4 bytes with number of records accepted
      const recordCount = packet.data?.records?.length || 0;
      const ack = Buffer.alloc(4);
      ack.writeUInt32BE(recordCount, 0);
      return ack;
    }

    return null;
  }

  /**
   * Transform to standard device data format
   */
  transformToDeviceData(packet: DecodedPacket): DeviceData | null {
    if (!packet.imei) {
      return null;
    }

    if (packet.type === PacketType.LOGIN) {
      return {
        imei: packet.imei,
        protocol: this.protocolName,
        packetType: packet.type,
        timestamp: packet.timestamp || new Date(),
        raw: packet.raw.toString('hex'),
      };
    }

    if (packet.type === PacketType.LOCATION && packet.data?.records) {
      const records = packet.data.records as TeltonikaAVLRecord[];
      
      // Return data for the first record (can be extended to handle multiple records)
      const record = records[0];
      
      if (record && this.isValidCoordinate(record.latitude, record.longitude)) {
        return {
          imei: packet.imei,
          protocol: this.protocolName,
          packetType: packet.type,
          timestamp: record.timestamp,
          location: {
            latitude: record.latitude,
            longitude: record.longitude,
            altitude: record.altitude,
            speed: record.speed,
            course: record.angle,
            satellites: record.satellites,
            timestamp: record.timestamp,
            valid: record.satellites > 0,
          },
          sensors: Object.fromEntries(record.ioElements),
          raw: packet.raw.toString('hex'),
        };
      }
    }

    return null;
  }
}
