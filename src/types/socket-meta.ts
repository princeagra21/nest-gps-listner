import * as net from 'net';


export interface SocketMeta {
  connectionId: string;
  imei?: string;
  isAuthorized: boolean;
  createdAt: Date;
  lastPacketAt?: Date; 
}

export type SocketWithMeta = net.Socket & { meta: SocketMeta };