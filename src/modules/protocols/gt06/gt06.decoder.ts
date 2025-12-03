import { Socket } from 'net';
import { Injectable } from '@nestjs/common';
import { BaseDecoder } from '../base/base-decoder.abstract';
import { DecodedPacket, PacketType, DeviceData, LocationData } from '../base/decoder.interface';
import { SocketWithMeta } from '../../../types/socket-meta';
import {
  GT06MessageType,
  GT06_START_BIT,
  GT06_START_BIT_LONG,
  GT06LocationInfo,
  GT06StatusInfo
} from './gt06.types';

@Injectable()
export class GT06Decoder extends BaseDecoder {
  readonly protocolName = 'GT06';
  readonly requiresDeviceValidation = false; // GT06 works without database validation

  /**
   * Check if buffer contains a complete GT06 packet
   */
  hasCompletePacket(buffer: Buffer): boolean {
    if (buffer.length < 5) {
      return false;
    }

    let totalLength = 2 + 2; // head (2) + tail (2)

    const firstByte = buffer.readUInt8(0);
    if (firstByte === 0x78) {
      // Short format: 0x78 0x78
      // Format: start(2) + length(1) + data(length) + crc(2) + stop(2)
      totalLength += 1 + buffer.readUInt8(2);
    } else if (firstByte === 0x79) {
      // Long format: 0x79 0x79
      // Format: start(2) + length(2) + data(length) + crc(2) + stop(2)
      if (buffer.length < 4) {
        return false;
      }
      totalLength += 2 + buffer.readUInt16BE(2);
    } else {
      return false;
    }

    // Verify stop bits (0x0D 0x0A) if we have enough data
    if (buffer.length >= totalLength && buffer.readUInt16BE(totalLength - 2) === 0x0d0a) {
      return true;
    }

    return buffer.length >= totalLength;
  }

  /**
   * Get the length of the next packet in buffer
   */
  getPacketLength(buffer: Buffer): number {
    if (buffer.length < 3) {
      return 0;
    }

    let totalLength = 2 + 2; // head (2) + tail (2)

    const firstByte = buffer.readUInt8(0);
    if (firstByte === 0x78) {
      // Short format: 0x78 0x78
      // Format: start(2) + length(1) + data(length) + crc(2) + stop(2)
      totalLength += 1 + buffer.readUInt8(2);
    } else if (firstByte === 0x79) {
      // Long format: 0x79 0x79
      // Format: start(2) + length(2) + data(length) + crc(2) + stop(2)
      if (buffer.length < 4) {
        return 0;
      }
      totalLength += 2 + buffer.readUInt16BE(2);
    } else {
      return 0;
    }

    return totalLength;
  }

  /**
   * Decode GT06 packet
   */
  decode(buffer: Buffer, socket: Socket): DecodedPacket | null {
    try {
      if (!this.hasCompletePacket(buffer)) {
        return null;
      }

      const firstByte = buffer.readUInt8(0);
      const isShortPacket = firstByte === 0x78;

      // Extract socket IMEI for use in location packets
      const socketWithMeta = socket as SocketWithMeta;
      const socketImei = socketWithMeta.meta?.imei || '';

      // Determine header size and length value
      let headerSize: number;
      let length: number;

      if (isShortPacket) {
        // Short format: start(2) + length(1)
        headerSize = 3;
        length = buffer.readUInt8(2);
      } else {
        // Long format: start(2) + length(2)
        headerSize = 4;
        length = buffer.readUInt16BE(2);
      }

      const messageType = buffer.readUInt8(headerSize);

      // Verify CRC
      // CRC is calculated from length byte to end of data (excluding CRC and stop bits)
      // Length includes: Protocol(1) + Data + Serial(2) + CRC(2)
      // So CRC starts at: headerSize + length - 2
      const crcPosition = headerSize + length - 2;
      const expectedCrc = buffer.readUInt16BE(crcPosition);

      // Calculate CRC from length byte (position 2) to end of data (before CRC)
      const calculatedCrc = this.calculateCrc16(buffer, 2, crcPosition);

      if (expectedCrc !== calculatedCrc) {
        // Fallback: Check if it's a simple checksum (sum of bytes)
        // Some GT06 clones use simple sum instead of CRC-ITU
        let sum = 0;
        for (let i = 2; i < crcPosition; i++) {
          sum += buffer[i];
        }
        const calculatedSum = sum & 0xffff;

        if (expectedCrc !== calculatedSum) {
          this.logger.error('CRC/Checksum mismatch in GT06 packet', undefined, {
            protocol: this.protocolName,
            expected: expectedCrc.toString(16).padStart(4, '0'),
            calculatedCrc: calculatedCrc.toString(16).padStart(4, '0'),
            calculatedSum: calculatedSum.toString(16).padStart(4, '0'),
            bufferHex: buffer.toString('hex'),
            crcPosition,
            length,
            headerSize,
            isShortPacket,
          });
          return null;
        } else {
          this.logger.debug('Packet validated using simple checksum instead of CRC');
        }
      }

      let packet: DecodedPacket | null = null;

      switch (messageType) {
        case GT06MessageType.LOGIN:
          packet = this.decodeLoginPacket(buffer, headerSize, length);
          break;
        case GT06MessageType.HEARTBEAT:
          packet = this.decodeHeartbeatPacket(buffer, headerSize, length);
          break;
        case GT06MessageType.LOCATION:
        case GT06MessageType.LOCATION_2:
        case GT06MessageType.GPS_LBS_1:
        case GT06MessageType.GPS_LBS_2:
          packet = this.decodeLocationPacket(buffer, messageType, headerSize, length, socketImei);
          break;
        case GT06MessageType.GPS_LBS_STATUS_1:
        case GT06MessageType.GPS_LBS_STATUS_2:
        case GT06MessageType.ALARM:
          packet = this.decodeAlarmPacket(buffer, messageType, headerSize, length, socketImei);
          break;
        default:
          this.logger.warn(`Unknown GT06 message type: 0x${messageType.toString(16)}`, {
            messageType,
            bufferHex: buffer.toString('hex'),
          });
          packet = {
            type: PacketType.UNKNOWN,
            raw: buffer,
            requiresAck: false,
          };
      }

      if (packet) {
        this.logDecode(packet);
      }

      return packet;
    } catch (error) {
      this.logError('Error decoding GT06 packet', buffer, error as Error);
      return null;
    }
  }

  /**
   * Decode login packet
   * Format: 78 78 0D 01 [IMEI 8 bytes] [Info Serial 2 bytes] [Error Check 2 bytes] 0D 0A
   */
  private decodeLoginPacket(buffer: Buffer, headerSize: number, length: number): DecodedPacket {
    // IMEI is 8 bytes starting after header (start + length + messageType)
    const imeiBuffer = buffer.slice(headerSize + 1, headerSize + 1 + 8);
    const imei = this.parseImei(imeiBuffer);

    // Info Serial Number (last 2 bytes before CRC)
    // CRC starts at: headerSize + length - 2
    // Serial starts at: headerSize + length - 4
    const serialPosition = headerSize + length - 4;
    const serial = buffer.readUInt16BE(serialPosition);

    return {
      type: PacketType.LOGIN,
      imei,
      data: { serial },
      raw: buffer,
      requiresAck: true,
      timestamp: new Date(),
    };
  }

  /**
   * Decode heartbeat packet
   * Format: 78 78 0B 13 [Terminal Info] [Voltage Level] [GSM Signal] [Alarm/Language] [Info Serial 2 bytes] [CRC] 0D 0A
   */
  private decodeHeartbeatPacket(buffer: Buffer, headerSize: number, length: number): DecodedPacket {
    let data: any = {};

    // Parse heartbeat data if available (starts after messageType)
    const dataOffset = headerSize + 1;
    if (length >= 5) {
      data.terminalInfo = buffer.readUInt8(dataOffset);
      data.voltage = buffer.readUInt8(dataOffset + 1);
      data.gsmSignal = buffer.readUInt8(dataOffset + 2);
      data.alarm = buffer.readUInt16BE(dataOffset + 3);
    }

    // Info Serial Number (last 2 bytes before CRC)
    const serialPosition = headerSize + length - 4;
    data.serial = buffer.readUInt16BE(serialPosition);

    return {
      type: PacketType.HEARTBEAT,
      data,
      raw: buffer,
      requiresAck: true,
      timestamp: new Date(),
    };
  }

  /**
   * Decode location packet
   * Format: 78 78 [Length] [Type] [Date Time] [GPS Data] [LBS Data] [Info Serial] [CRC] 0D 0A
   */
  private decodeLocationPacket(buffer: Buffer, messageType: number, headerSize: number, length: number, socketImei?: string): DecodedPacket {
    // Data starts after header (start + length + messageType)
    const dataOffset = headerSize + 1;

    // Parse date/time (6 bytes: YY MM DD HH MM SS)
    const year = 2000 + buffer.readUInt8(dataOffset);
    const month = buffer.readUInt8(dataOffset + 1);
    const day = buffer.readUInt8(dataOffset + 2);
    const hour = buffer.readUInt8(dataOffset + 3);
    const minute = buffer.readUInt8(dataOffset + 4);
    const second = buffer.readUInt8(dataOffset + 5);
    const timestamp = new Date(year, month - 1, day, hour, minute, second);

    // Parse GPS data length and satellite count
    const gpsLength = buffer.readUInt8(dataOffset + 6);
    const satelliteCount = gpsLength & 0x0F;

    // Parse latitude (4 bytes)
    const latitudeRaw = buffer.readUInt32BE(dataOffset + 7);
    let latitude = latitudeRaw / 1800000.0;

    // Parse longitude (4 bytes)
    const longitudeRaw = buffer.readUInt32BE(dataOffset + 11);
    let longitude = longitudeRaw / 1800000.0;

    // Parse speed (1 byte)
    const speed = buffer.readUInt8(dataOffset + 15);

    // Parse course and status (2 bytes)
    const courseStatus = buffer.readUInt16BE(dataOffset + 16);
    const course = courseStatus & 0x03FF; // First 10 bits
    const gpsRealtime = !!(courseStatus & 0x2000); // Bit 13: GPS realtime
    const gpsPositioned = !!(courseStatus & 0x1000); // Bit 12: GPS positioned
    const eastWest = !!(courseStatus & 0x0800); // Bit 11: 0=East, 1=West
    const northSouth = !!(courseStatus & 0x0400); // Bit 10: 0=South, 1=North

    // Apply hemisphere
    if (!northSouth) latitude = -latitude;
    if (eastWest) longitude = -longitude;

    // Parse LBS data
    const mcc = buffer.readUInt16BE(dataOffset + 18);
    const mnc = buffer.readUInt8(dataOffset + 20);
    const lac = buffer.readUInt16BE(dataOffset + 21);
    const cellId = buffer.readUInt32BE(dataOffset + 23) >> 8; // 3 bytes

    // ACC status (if available)
    let acc = false;
    if (length > 25) { // Check if we have enough data for ACC byte
      const accOffset = dataOffset + 24; // ACC is typically at offset 24 from data start
      if (buffer.length > accOffset) {
        acc = !!(buffer.readUInt8(accOffset) & 0x01);
      }
    }

    // Info Serial Number (last 2 bytes before CRC)
    const serialPosition = headerSize + length - 4;
    const serial = buffer.readUInt16BE(serialPosition);

    const location = {
      timestamp,
      latitude,
      longitude,
      speed,
      course,
      satelliteCount,
      gpsPositioned,
      gpsRealtime,
      mcc,
      mnc,
      lac,
      cellId,
      acc,
      serial,
    };

    // Debug logging for location data
    this.logger.debug('GT06 Location parsed', {
      imei: socketImei,
      timestamp: timestamp.toISOString(),
      latitude,
      longitude,
      speed,
      course,
      satellites: satelliteCount,
      acc,
      gpsPositioned,
      gpsRealtime
    });

    return {
      type: PacketType.LOCATION,
      imei: socketImei || '',
      data: location,
      raw: buffer,
      requiresAck: true,
      timestamp,
    };
  }

  /**
   * Decode alarm packet
   */
  private decodeAlarmPacket(buffer: Buffer, messageType: number, headerSize: number, length: number, socketImei?: string): DecodedPacket {
    const dataOffset = headerSize + 1;
    const location = this.parseLocationInfo(buffer, dataOffset);
    const status = this.parseStatusInfo(buffer, dataOffset + 17); // location data is 17 bytes

    // Info Serial Number (last 2 bytes before CRC)
    const serialPosition = headerSize + length - 4;
    const serial = buffer.readUInt16BE(serialPosition);

    return {
      type: PacketType.ALARM,
      imei: socketImei || '',
      data: {
        location,
        status,
        serial,
      },
      raw: buffer,
      requiresAck: true,
      timestamp: location.timestamp,
    };
  }

  /**
   * Parse IMEI from buffer
   * GT06 sends IMEI as 8 bytes in hex (16 hex digits)
   * Example: 00 00 00 00 03 33 22 10 = "0000000003332210"
   * We need to remove leading zeros for database lookup
   */
  private parseImei(buffer: Buffer): string {
    let imei = '';
    for (let i = 0; i < 8; i++) {
      imei += buffer[i].toString(16).padStart(2, '0');
    }

    // Remove leading zeros (but keep at least one digit)
    imei = imei.replace(/^0+/, '') || '0';

    this.logger.debug('IMEI parsed', {
      raw: buffer.toString('hex'),
      parsed: imei,
    });

    return imei;
  }

  /**
   * Parse location information
   */
  private parseLocationInfo(buffer: Buffer, offset: number): GT06LocationInfo {
    const gpsInfoLength = buffer.readUInt8(offset);
    const satelliteCount = gpsInfoLength & 0x0f;

    // Parse timestamp (YY MM DD HH MM SS)
    const year = 2000 + buffer.readUInt8(offset + 1);
    const month = buffer.readUInt8(offset + 2);
    const day = buffer.readUInt8(offset + 3);
    const hour = buffer.readUInt8(offset + 4);
    const minute = buffer.readUInt8(offset + 5);
    const second = buffer.readUInt8(offset + 6);
    const timestamp = new Date(year, month - 1, day, hour, minute, second);

    // Parse coordinates
    const latitude = buffer.readUInt32BE(offset + 7) / 1800000;
    const longitude = buffer.readUInt32BE(offset + 11) / 1800000;
    const speed = buffer.readUInt8(offset + 15);

    // Parse course and status
    const courseStatus = buffer.readUInt16BE(offset + 16);
    const course = courseStatus & 0x03ff;
    const gpsFixed = !!(courseStatus & 0x1000);
    const latHemisphere = (courseStatus & 0x0400) ? 'S' : 'N';
    const lonHemisphere = (courseStatus & 0x0800) ? 'W' : 'E';

    // Parse LBS info
    const mcc = buffer.readUInt16BE(offset + 18);
    const mnc = buffer.readUInt8(offset + 20);
    const lac = buffer.readUInt16BE(offset + 21);
    const cellId = buffer.readUInt32BE(offset + 23) & 0xffffff;

    const acc = !!(buffer.readUInt8(offset + 26) & 0x01);

    return {
      gpsLength: gpsInfoLength,
      satelliteCount,
      latitude: latHemisphere === 'S' ? -latitude : latitude,
      longitude: lonHemisphere === 'W' ? -longitude : longitude,
      speed,
      course,
      timestamp,
      mcc,
      mnc,
      lac,
      cellId,
      acc,
      gpsFixed,
    };
  }

  /**
   * Parse status information
   */
  private parseStatusInfo(buffer: Buffer, offset: number): GT06StatusInfo {
    if (buffer.length < offset + 5) {
      return {
        terminalInfo: 0,
        batteryLevel: 0,
        gsmSignal: 0,
        alarm: 0,
        language: 0,
      };
    }

    return {
      terminalInfo: buffer.readUInt8(offset),
      batteryLevel: buffer.readUInt8(offset + 1),
      gsmSignal: buffer.readUInt8(offset + 2),
      alarm: buffer.readUInt8(offset + 3),
      language: buffer.readUInt16BE(offset + 4),
    };
  }

  /**
   * Generate acknowledgment packet
   */
  generateAck(packet: DecodedPacket): Buffer | null {
    if (!packet.requiresAck) {
      return null;
    }

    const raw = packet.raw;
    const length = raw.readUInt8(2);
    const messageType = raw.readUInt8(3);

    // Extract serial number from packet data
    const serial = packet.data?.serial || 0x0001;

    // Build ACK packet based on message type
    let ackBuffer: Buffer;

    if (messageType === GT06MessageType.LOGIN) {
      // Login ACK: 78 78 05 01 [Serial 2 bytes] [CRC 2 bytes] 0D 0A
      ackBuffer = Buffer.alloc(10);
      ackBuffer.writeUInt16BE(GT06_START_BIT, 0);
      ackBuffer.writeUInt8(0x05, 2); // Length
      ackBuffer.writeUInt8(0x01, 3); // Protocol number (LOGIN)
      ackBuffer.writeUInt16BE(serial, 4); // Serial number

      // Calculate CRC
      const crc = this.calculateCrc16(ackBuffer, 2, 6);
      ackBuffer.writeUInt16BE(crc, 6);
      ackBuffer.writeUInt16BE(0x0d0a, 8); // Stop bits
    } else {
      // Standard ACK for heartbeat, location, etc.
      // Format: 78 78 05 [Type] [Serial 2 bytes] [CRC 2 bytes] 0D 0A
      ackBuffer = Buffer.alloc(10);
      ackBuffer.writeUInt16BE(GT06_START_BIT, 0);
      ackBuffer.writeUInt8(0x05, 2); // Length
      ackBuffer.writeUInt8(messageType, 3); // Echo message type
      ackBuffer.writeUInt16BE(serial, 4); // Serial number

      // Calculate CRC
      const crc = this.calculateCrc16(ackBuffer, 2, 6);
      ackBuffer.writeUInt16BE(crc, 6);
      ackBuffer.writeUInt16BE(0x0d0a, 8); // Stop bits
    }

    this.logger.debug('Generated ACK', {
      protocol: this.protocolName,
      messageType: '0x' + messageType.toString(16).padStart(2, '0'),
      serial: '0x' + serial.toString(16).padStart(4, '0'),
      ackHex: ackBuffer.toString('hex'),
    });

    return ackBuffer;
  }

  /**
   * Transform to standard device data format
   */
  transformToDeviceData(packet: DecodedPacket): DeviceData | null {
    // For LOGIN packets, IMEI must be present in the packet
    if (packet.type === PacketType.LOGIN && !packet.imei) {
      return null;
    }

    // For other packet types, IMEI should be available from socket
    if (!packet.imei && packet.type !== PacketType.LOGIN) {
      this.logger.warn('Missing IMEI for packet type', { type: packet.type });
      return null;
    }

    const deviceData: DeviceData = {
      imei: packet.imei || '',
      protocol: this.protocolName,
      packetType: packet.type,
      timestamp: packet.timestamp || new Date(),
      raw: packet.raw.toString('hex'),
    };

    if (packet.type === PacketType.LOCATION) {
      const locationInfo = packet.data;

      if (locationInfo) {
        const isValid = this.isValidCoordinate(locationInfo.latitude, locationInfo.longitude);
        if (!isValid) {
          this.logger.warn('Invalid coordinates in GT06 location packet', {
            imei: packet.imei,
            lat: locationInfo.latitude,
            lon: locationInfo.longitude,
          });
        }

        if (isValid) {
          deviceData.location = {
            latitude: locationInfo.latitude,
            longitude: locationInfo.longitude,
            altitude: 0,
            speed: locationInfo.speed,
            course: locationInfo.course,
            satellites: locationInfo.satelliteCount,
            timestamp: locationInfo.timestamp,
            valid: locationInfo.gpsPositioned || false,
          };

          // Include additional status info with more details
          deviceData.sensors = {
            mcc: locationInfo.mcc,
            mnc: locationInfo.mnc,
            lac: locationInfo.lac,
            cellId: locationInfo.cellId,
            acc: locationInfo.acc,
            gpsRealtime: locationInfo.gpsRealtime,
            satellites: locationInfo.satelliteCount,
            speed: locationInfo.speed,
            course: locationInfo.course,
            gpsPositioned: locationInfo.gpsPositioned,
            serial: locationInfo.serial
          };
        }
      } else {
        this.logger.warn('No location info in GT06 location packet', { imei: packet.imei });
      }
    } else if (packet.type === PacketType.ALARM) {
      const locationInfo = packet.data?.location || packet.data;

      if (locationInfo && this.isValidCoordinate(locationInfo.latitude, locationInfo.longitude)) {
        deviceData.location = {
          latitude: locationInfo.latitude,
          longitude: locationInfo.longitude,
          altitude: 0,
          speed: locationInfo.speed,
          course: locationInfo.course,
          satellites: locationInfo.satelliteCount,
          timestamp: locationInfo.timestamp,
          valid: locationInfo.gpsFixed || false,
        };
      }

      if (packet.data?.status) {
        deviceData.status = {
          batteryLevel: packet.data.status.batteryLevel,
          gsmSignal: packet.data.status.gsmSignal,
          alarm: packet.data.status.alarm,
        };
      }
    }

    return deviceData;
  }
}
