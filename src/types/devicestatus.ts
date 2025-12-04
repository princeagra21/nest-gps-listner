export type DeviceConnectionStatus = 'CONNECTED' | 'DISCONNECTED';

export interface DeviceStatusPayload {
  imei: string;                      // required
  status?: DeviceConnectionStatus;   // optional
  updatedAt?: string | Date;         // optional

  acc?: boolean;
  course?: number;
  lat?: number;
  lon?: number;
  satellites?: number;
  speed?: number;
}
