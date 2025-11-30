import { Socket } from 'net';

export enum PacketType {
  LOGIN = 'LOGIN',
  HEARTBEAT = 'HEARTBEAT',
  LOCATION = 'LOCATION',
  ALARM = 'ALARM',
  STATUS = 'STATUS',
  UNKNOWN = 'UNKNOWN',
}

export interface DecodedPacket {
  type: PacketType;
  imei?: string;
  data?: any;
  raw: Buffer;
  timestamp?: Date;
  requiresAck: boolean;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  course?: number;
  satellites?: number;
  hdop?: number;
  timestamp: Date;
  valid: boolean;
}

export interface DeviceData {
  imei: string;
  protocol: string;
  packetType: PacketType;
  location?: LocationData;
  sensors?: Record<string, any>;
  status?: Record<string, any>;
  timestamp: Date;
  raw?: string;
}

export interface IProtocolDecoder {
  readonly protocolName: string;
  
  /**
   * Decode incoming data buffer
   */
  decode(buffer: Buffer, socket: Socket): DecodedPacket | null;
  
  /**
   * Generate acknowledgment packet
   */
  generateAck(packet: DecodedPacket): Buffer | null;
  
  /**
   * Transform decoded packet to standard device data format
   */
  transformToDeviceData(packet: DecodedPacket): DeviceData | null;
  
  /**
   * Check if buffer contains a complete packet
   */
  hasCompletePacket(buffer: Buffer): boolean;
  
  /**
   * Get the length of the next packet in buffer
   */
  getPacketLength(buffer: Buffer): number;
}
