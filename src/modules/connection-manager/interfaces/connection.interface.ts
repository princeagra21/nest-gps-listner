export interface ConnectionInfo {
  imei: string;
  protocol: string;
  port: number;
  remoteAddress: string;
  remotePort: number;
  connectedAt: Date;
  lastActivity: Date;
}

export interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  connectionsByProtocol: Record<string, number>;
}
