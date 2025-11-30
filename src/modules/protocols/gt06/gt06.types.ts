export enum GT06MessageType {
  LOGIN = 0x01,
  HEARTBEAT = 0x13,
  LOCATION = 0x12,
  LOCATION_2 = 0x22,
  ALARM = 0x16,
  GPS_LBS_STATUS = 0x16,
  STATUS = 0x1a,
  STRING_INFO = 0x15,
  GPS_LBS_1 = 0x12,
  GPS_LBS_2 = 0x22,
  GPS_LBS_STATUS_1 = 0x16,
  GPS_LBS_STATUS_2 = 0x26,
  LBS_MULTIPLE = 0x28,
  LBS_WIFI = 0x2c,
  COMMAND_INFO = 0x80,
}

export const GT06_START_BIT = 0x7878;
export const GT06_START_BIT_LONG = 0x7979;

export interface GT06LocationInfo {
  gpsLength: number;
  satelliteCount: number;
  latitude: number;
  longitude: number;
  speed: number;
  course: number;
  timestamp: Date;
  mcc: number;
  mnc: number;
  lac: number;
  cellId: number;
  acc: boolean;
  gpsFixed: boolean;
}

export interface GT06StatusInfo {
  terminalInfo: number;
  batteryLevel: number;
  gsmSignal: number;
  alarm: number;
  language: number;
}
