import { Injectable, Inject } from '@nestjs/common';
import { Socket } from 'net';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ExtendedLoggerService } from '@/modules/logger/logger.interface';
import { BaseDecoder } from '../base/base-decoder.abstract';
import { DecodedPacket, PacketType, DeviceData, LocationData } from '../base/decoder.interface';
import { GT06MessageType, GT06_START_BIT, GT06_START_BIT_LONG, GT06LocationInfo, GT06StatusInfo } from './gt06.types';
import { SocketWithMeta } from '@/types/socket-meta';
import { CommonService } from '@/modules/common/common.service';
import { DataForwarderService } from '@/modules/data-forwarder/data-forwarder.service';

@Injectable()
export class GT06Service extends BaseDecoder {
  readonly protocolName = 'GT06';
  readonly requiresDeviceValidation = true;

  private static readonly MIN_PACKET_LENGTH = 10;
  private static readonly MAX_PACKET_LENGTH = 1024;
  private static readonly SERIAL_NUMBER_LENGTH = 2;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    logger: ExtendedLoggerService,
    private readonly dataForwarder: DataForwarderService,
    private readonly commonService: CommonService,
    
  ) {
    super(logger);
  }

  /**
   * Check if buffer contains a complete GT06 packet
   */
  hasCompletePacket(buffer: Buffer): boolean {
    if (buffer.length < GT06Service.MIN_PACKET_LENGTH) {
      return false;
    }

    const startBit = buffer.readUInt16BE(0);
    if (startBit !== GT06_START_BIT && startBit !== GT06_START_BIT_LONG) {
      return false;
    }

    const packetLength = this.getPacketLength(buffer);
    return packetLength > 0 && buffer.length >= packetLength;
  }

  /**
   * Get the length of the next packet in buffer
   */
  getPacketLength(buffer: Buffer): number {
    if (buffer.length < 3) {
      return 0;
    }

    const startBit = buffer.readUInt16BE(0);
    if (startBit === GT06_START_BIT) {
      // Short packet: 0x7878 + length (1 byte) + data + serial (2) + crc (2) + 0x0D0A
      const length = buffer[2];
      return length + 5; // start(2) + length(1) + payload + stop(2)
    } else if (startBit === GT06_START_BIT_LONG) {
      // Long packet: 0x7979 + length (2 bytes) + data + serial (2) + crc (2) + 0x0D0A
      if (buffer.length < 4) return 0;
      const length = buffer.readUInt16BE(2);
      return length + 6; // start(2) + length(2) + payload + stop(2)
    }

    return 0;
  }

  /**
   * Decode GT06 protocol packet
   */
  decode(buffer: Buffer, socket: Socket): DecodedPacket | null {
    try {
      const startBit = buffer.readUInt16BE(0);
      const isLongPacket = startBit === GT06_START_BIT_LONG;
      
      let offset = 2; // Skip start bit
      let protocolNumber: number;
      let serialNumber: number;
      let payloadLength: number;

      if (isLongPacket) {
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
      } else {
        payloadLength = buffer[offset];
        offset += 1;
      }

      // Extract protocol number (message type)
      protocolNumber = buffer[offset];
      offset += 1;

      // Get IMEI from socket.meta if not a login packet
      const socketWithMeta = socket as SocketWithMeta;
      const imeiFromMeta = socketWithMeta.meta?.imei;

      // Decode based on message type
      let decodedPacket: DecodedPacket;

      switch (protocolNumber) {
        case GT06MessageType.LOGIN:
          decodedPacket = this.decodeLogin(buffer, offset);
          break;

        case GT06MessageType.HEARTBEAT:
          decodedPacket = this.decodeHeartbeat(buffer, offset, imeiFromMeta);
          break;

        case GT06MessageType.LOCATION:
        case GT06MessageType.GPS_LBS_1:
        case GT06MessageType.GPS_LBS_2:
        case GT06MessageType.LOCATION_2:
          decodedPacket = this.decodeLocation(buffer, offset, protocolNumber, imeiFromMeta);
          break;

        case GT06MessageType.ALARM:
        case GT06MessageType.GPS_LBS_STATUS_1:
        case GT06MessageType.GPS_LBS_STATUS_2:
          decodedPacket = this.decodeAlarm(buffer, offset, imeiFromMeta);
          break;

        case GT06MessageType.STATUS:
          decodedPacket = this.decodeStatus(buffer, offset, imeiFromMeta);
          break;

        default:
          this.logger.warn(`Unknown GT06 protocol number: 0x${protocolNumber.toString(16)}`);
          decodedPacket = {
            type: PacketType.UNKNOWN,
            raw: buffer,
            requiresAck: true,
            timestamp: new Date(),
            imei: imeiFromMeta,
          };
      }

      // Extract serial number for ACK
      const serialOffset = buffer.length - 6;
      serialNumber = buffer.readUInt16BE(serialOffset);
      decodedPacket.data = { ...decodedPacket.data, serialNumber };

      this.logDecode(decodedPacket);

      return decodedPacket;
    } catch (error) {
      this.logError('Failed to decode GT06 packet', buffer, error as Error);
      return null;
    }
  }

  /**
   * Decode LOGIN packet
   */
  private decodeLogin(buffer: Buffer, offset: number): DecodedPacket {
    const imeiBytes = buffer.slice(offset, offset + 8);
    const imei = imeiBytes.toString('hex');
    
    // Convert hex IMEI to decimal IMEI (15 digits)
    const imeiDecimal = this.hexToImei(imei);

    return {
      type: PacketType.LOGIN,
      imei: imeiDecimal,
      raw: buffer,
      requiresAck: true,
      timestamp: new Date(),
      data: {
        imeiHex: imei,
      },
    };
  }

  /**
   * Decode HEARTBEAT packet
   */
  private decodeHeartbeat(buffer: Buffer, offset: number, imei?: string): DecodedPacket {
    const terminalInfo = buffer[offset];
    const batteryLevel = buffer[offset + 1];
    const gsmSignal = buffer[offset + 2];
    const alarm = buffer[offset + 3];
    const language = buffer[offset + 4];

    return {
      type: PacketType.HEARTBEAT,
      imei,
      raw: buffer,
      requiresAck: true,
      timestamp: new Date(),
      data: {
        terminalInfo,
        batteryLevel,
        gsmSignal,
        alarm,
        language,
      } as GT06StatusInfo,
    };
  }

  /**
   * Decode LOCATION packet (0x12, 0x22, etc.)
   * Production-standard implementation matching Traccar specification
   * Reference: GT06 Protocol v1.8 & Traccar GT06ProtocolDecoder
   */
  private decodeLocation(buffer: Buffer, offset: number, protocolNumber: number, imei?: string): DecodedPacket {
    let currentOffset = offset;

    // Parse date and time (6 bytes: YY MM DD HH MM SS)
    const year = 2000 + buffer[currentOffset];
    const month = buffer[currentOffset + 1];
    const day = buffer[currentOffset + 2];
    const hour = buffer[currentOffset + 3];
    const minute = buffer[currentOffset + 4];
    const second = buffer[currentOffset + 5];
    currentOffset += 6;

    const timestamp = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    // GPS info byte: upper 4 bits = GPS length, lower 4 bits = satellite count
    const gpsInfo = buffer[currentOffset];
    const gpsLength = (gpsInfo >> 4) & 0x0f;
    const satelliteCount = gpsInfo & 0x0f;
    currentOffset += 1;

    // Latitude (4 bytes) - raw value, hemisphere determined by status bits
    const latRaw = buffer.readUInt32BE(currentOffset);
    let latitude = latRaw / 1800000.0; // Convert to decimal degrees (30 * 60 * 1000)
    currentOffset += 4;

    // Longitude (4 bytes) - raw value, hemisphere determined by status bits
    const lonRaw = buffer.readUInt32BE(currentOffset);
    let longitude = lonRaw / 1800000.0;
    currentOffset += 4;

    // Speed (1 byte, km/h)
    const speed = buffer[currentOffset];
    currentOffset += 1;

    // Course and status (2 bytes)
    // Bit 15-14: Reserved
    // Bit 13: GPS Realtime (0=not realtime, 1=realtime)
    // Bit 12: GPS Positioned (0=not fixed, 1=fixed)
    // Bit 11: Longitude hemisphere (0=East, 1=West)
    // Bit 10: Latitude hemisphere (0=South, 1=North)
    // Bit 9-0: Course (0-360 degrees)
    const courseStatus = buffer.readUInt16BE(currentOffset);
    const course = courseStatus & 0x03ff; // Lower 10 bits (0-1023)
    const gpsRealtime = (courseStatus & 0x2000) !== 0; // Bit 13
    const gpsFixed = (courseStatus & 0x1000) !== 0;    // Bit 12 (GPS Positioned)
    const lonWest = (courseStatus & 0x0800) !== 0;     // Bit 11 (1=West)
    const latNorth = (courseStatus & 0x0400) !== 0;    // Bit 10 (1=North)
    currentOffset += 2;

    // Apply hemisphere corrections
    // If bit 10 is 0, latitude is South (negative)
    if (!latNorth) {
      latitude = -latitude;
    }
    // If bit 11 is 1, longitude is West (negative)
    if (lonWest) {
      longitude = -longitude;
    }

    // MCC, MNC, LAC, Cell ID (LBS data - 8 bytes total)
    let mcc = 0, mnc = 0, lac = 0, cellId = 0;
    
    // Calculate how many bytes remain before serial+crc+stop (6 bytes)
    const remainingBytes = buffer.length - currentOffset - 6;
    
    if (remainingBytes >= 8) {
      // MCC (2 bytes) - Mobile Country Code
      mcc = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;
      
      // MNC (1 byte) - Mobile Network Code
      mnc = buffer[currentOffset];
      currentOffset += 1;
      
      // LAC (2 bytes) - Location Area Code
      lac = buffer.readUInt16BE(currentOffset);
      currentOffset += 2;
      
      // Cell ID (3 bytes) - stored as 4 bytes but only 3 are used
      // Read 4 bytes and shift right by 8 bits to get 3-byte value
      const cellIdRaw = buffer.readUInt32BE(currentOffset - 1);
      cellId = cellIdRaw & 0x00ffffff;
      currentOffset += 3;
    }

    // ACC status (1 byte) - optional, present in extended location packets
    // Bit 0: ACC status (0=off, 1=on)
    let acc = false;
    if (remainingBytes >= 9) {
      const accByte = buffer[currentOffset];
      acc = (accByte & 0x01) !== 0;
      currentOffset += 1;
    }

    const locationInfo: GT06LocationInfo = {
      gpsLength,
      satelliteCount,
      latitude,
      longitude,
      speed,
      course,
      timestamp,
      mcc,
      mnc,
      lac,
      cellId,
      acc,
      gpsFixed,
      gpsRealtime,
    };

    // Location is valid if GPS is fixed and coordinates are reasonable
    const isValid = this.isValidCoordinate(latitude, longitude) && gpsFixed;

    return {
      type: PacketType.LOCATION,
      imei,
      raw: buffer,
      requiresAck: true,
      timestamp,
      data: {
        location: locationInfo,
        valid: isValid,
      },
    };
  }

  /**
   * Decode ALARM packet
   */
  private decodeAlarm(buffer: Buffer, offset: number, imei?: string): DecodedPacket {
    // Alarm packets typically contain location data + alarm flags
    const locationPacket = this.decodeLocation(buffer, offset, GT06MessageType.ALARM, imei);
    
    return {
      ...locationPacket,
      type: PacketType.ALARM,
    };
  }

  /**
   * Decode STATUS packet
   */
  private decodeStatus(buffer: Buffer, offset: number, imei?: string): DecodedPacket {
    const terminalInfo = buffer[offset];
    const batteryLevel = buffer[offset + 1];
    const gsmSignal = buffer[offset + 2];
    const alarm = buffer[offset + 3];
    const language = buffer[offset + 4];

    const statusInfo: GT06StatusInfo = {
      terminalInfo,
      batteryLevel,
      gsmSignal,
      alarm,
      language,
    };

    return {
      type: PacketType.STATUS,
      imei,
      raw: buffer,
      requiresAck: true,
      timestamp: new Date(),
      data: statusInfo,
    };
  }

  /**
   * Generate acknowledgment packet for GT06
   */
  generateAck(packet: DecodedPacket): Buffer | null {
    try {
      const serialNumber = packet.data?.serialNumber || 0;
      
      // Build ACK packet: 0x7878 + length + protocol + serial + crc + 0x0D0A
      let protocolNumber = 0x01; // Default LOGIN ACK

      switch (packet.type) {
        case PacketType.LOGIN:
          protocolNumber = 0x01;
          break;
        case PacketType.HEARTBEAT:
          protocolNumber = 0x13;
          break;
        case PacketType.LOCATION:
          protocolNumber = 0x12;
          break;
        case PacketType.ALARM:
          protocolNumber = 0x16;
          break;
        default:
          protocolNumber = 0x01;
      }

      const ackBuffer = Buffer.alloc(10);
      let offset = 0;

      // Start bit
      ackBuffer.writeUInt16BE(GT06_START_BIT, offset);
      offset += 2;

      // Length (5 bytes: protocol + serial + crc)
      ackBuffer[offset] = 0x05;
      offset += 1;

      // Protocol number
      ackBuffer[offset] = protocolNumber;
      offset += 1;

      // Serial number
      ackBuffer.writeUInt16BE(serialNumber, offset);
      offset += 2;

      // Calculate CRC
      const crc = this.calculateCrc16(ackBuffer, 2, offset);
      ackBuffer.writeUInt16BE(crc, offset);
      offset += 2;

      // Stop bits
      ackBuffer[offset] = 0x0d;
      ackBuffer[offset + 1] = 0x0a;

      this.logger.debug(`Generated ACK for packet type ${packet.type}`, {
        serial: serialNumber,
        ack: ackBuffer.toString('hex'),
      });

      return ackBuffer;
    } catch (error) {
      this.logger.error('Failed to generate ACK', (error as Error).stack);
      return null;
    }
  }

  /**
   * Transform decoded packet to standard device data format
   * Production-standard implementation with comprehensive sensor data
   */
  transformToDeviceData(packet: DecodedPacket): DeviceData | null {
    if (!packet.imei && packet.type !== PacketType.LOCATION && packet.type !== PacketType.ALARM) {
      return null;
    }

    const deviceData: DeviceData = {
      imei: packet.imei ||  'unknown',
      protocol: this.protocolName,
      packetType: packet.type,
      timestamp: packet.timestamp || new Date(),
      raw: packet.raw.toString('hex'),
    };

    // Add location data if present
    if (packet.type === PacketType.LOCATION || packet.type === PacketType.ALARM) {
      const locationInfo = packet.data?.location as GT06LocationInfo;
      if (locationInfo) {
        // Standard location data
        deviceData.location = {
          latitude: locationInfo.latitude,
          longitude: locationInfo.longitude,
          altitude: 0,
          speed: locationInfo.speed,
          course: locationInfo.course,
          satellites: locationInfo.satelliteCount,
          timestamp: locationInfo.timestamp,
          valid: packet.data?.valid || false,
        } as LocationData;

        // Comprehensive sensor data including all GT06-specific fields
        deviceData.sensors = {
          // GPS data
          gpsFixed: locationInfo.gpsFixed,
          gpsRealtime: locationInfo.gpsRealtime,
          satelliteCount: locationInfo.satelliteCount,
          gpsLength: locationInfo.gpsLength,
          speed: locationInfo.speed,
          course: locationInfo.course,
          
          // LBS (Location Based Service) data
          mcc: locationInfo.mcc,
          mnc: locationInfo.mnc,
          lac: locationInfo.lac,
          cellId: locationInfo.cellId,
          
          // Vehicle status
          acc: locationInfo.acc,
          
          // Serial number from packet
          serialNumber: packet.data?.serialNumber,
        };
      }
    }

    // Add status data if present
    if (packet.type === PacketType.HEARTBEAT || packet.type === PacketType.STATUS) {
      deviceData.status = packet.data as GT06StatusInfo;
    }

    return deviceData;
  }

  /**
   * Process GT06 data - Main orchestration method
   * This is called from tcp-server after decoding
   */
  async processData(
    socket: SocketWithMeta,
    parsedData: { packetsProcessed: number; packetTypes: string[]; deviceData: any[] },
    port: number,
  ): Promise<void> {

    console.log('Inside GT06Service processData method');
    try {
      
      // Process each device data packet
      for (const deviceData of parsedData.deviceData) {
        if (deviceData) {

            if(deviceData.packetType === PacketType.LOGIN){                
               const isimeivalid = await this.commonService.validateImei(deviceData.imei);              
                if(!isimeivalid){                    
                    socket.destroy();
                    return;
                }
                socket.meta.imei = deviceData.imei;
                socket.meta.lastPacketAt = new Date();
                socket.meta.isAuthorized = true;
                await this.commonService.updateDeviceLiveStatus({
                  imei: deviceData.imei,
                  status: 'CONNECTED',
                  updatedAt: new Date(),
                });
                let commands =  await this.commonService.getDeviceCommands(deviceData.imei);
                console.log('Pending Commands:',commands);
                for(const cmd of commands)
                {
                    await this.sendCommand(socket,cmd.command);
                    await this.commonService.removeDeviceCommand(deviceData.imei,cmd.id);
                }
            }
            if(deviceData.packetType === PacketType.HEARTBEAT && socket.meta.isAuthorized)
            {
                await this.commonService.updateDeviceLiveStatus({
                  imei: socket.meta.imei!,
                  status: 'CONNECTED',
                  updatedAt: new Date(),
                });
            }

            console.log('GT06 Device Data:', deviceData);
            if(deviceData.packetType === PacketType.LOCATION && socket.meta.isAuthorized)
            {
                await this.commonService.updateDeviceLiveStatus({
                    imei: deviceData.imei,
                    status: 'CONNECTED',
                    updatedAt: new Date(),
                    acc: deviceData.sensors?.acc,
                    course: deviceData.location?.course,
                    satellites: deviceData.location?.satellites,
                    speed: deviceData.location?.speed,
                    lat: deviceData.location?.latitude,
                    lon: deviceData.location?.longitude
                });

                this.dataForwarder.forwardData(deviceData);
                
            }
           
                
           
          // Log successful processing
        //   this.logger.log(`📍 GT06 data processed for device ${deviceData.imei}`, {
        //     type: deviceData.packetType,
        //     hasLocation: !!deviceData.location,
        //   });

          // Here you can add additional processing like:
          // - Forwarding to external API
          // - Storing in database
          // - Publishing to message queue
          // These would be injected services
        }
      }
    } catch (error) {
      this.logger.error('Error processing GT06 data', (error as Error).stack);
    }
  }

  /**
   * Encode command to send to GT06 device
   */
  encodeCommand(command: string, serialNumber: number = 1): Buffer | null {
    try {
      // GT06 command format: 0x7878 + length + 0x80 + command + serial + crc + 0x0D0A
      const commandBytes = Buffer.from(command, 'utf8');
      const packetLength = commandBytes.length + 7; // protocol(1) + content length(2) + content + serial(2) + crc(2)
      
      const buffer = Buffer.alloc(packetLength + 5); // +5 for start(2), length(1), stop(2)
      let offset = 0;

      // Start bit
      buffer.writeUInt16BE(GT06_START_BIT, offset);
      offset += 2;

      // Length
      buffer[offset] = packetLength;
      offset += 1;

      // Protocol number for command
      buffer[offset] = GT06MessageType.COMMAND_INFO;
      offset += 1;

      // Command length
      buffer.writeUInt16BE(commandBytes.length, offset);
      offset += 2;

      // Command content
      commandBytes.copy(buffer, offset);
      offset += commandBytes.length;

      // Serial number
      buffer.writeUInt16BE(serialNumber, offset);
      offset += 2;

      // CRC
      const crc = this.calculateCrc16(buffer, 2, offset);
      buffer.writeUInt16BE(crc, offset);
      offset += 2;

      // Stop bits
      buffer[offset] = 0x0d;
      buffer[offset + 1] = 0x0a;

      this.logger.debug(`Encoded GT06 command: ${command}`, {
        hex: buffer.toString('hex'),
      });

      return buffer;
    } catch (error) {
      this.logger.error('Failed to encode command', (error as Error).stack);
      return null;
    }
  }

  /**
   * Send command to GT06 device
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
            this.logger.log(`✅ Command sent to GT06 device: ${command}`);
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
