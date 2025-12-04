export enum TeltonikaCodec {
  CODEC_8 = 0x08,
  CODEC_8_EXT = 0x8e,
  CODEC_16 = 0x10,
  CODEC_12 = 0x0c,
}

export interface TeltonikaAVLRecord {
  timestamp: Date;
  priority: number;
  longitude: number;
  latitude: number;
  altitude: number;
  angle: number;
  satellites: number;
  speed: number;
  eventId: number;
  ioElements: Map<number, any>;
}

export interface TeltonikaPacket {
  imei?: string;
  codecId: number;
  recordCount: number;
  records: TeltonikaAVLRecord[];
}
