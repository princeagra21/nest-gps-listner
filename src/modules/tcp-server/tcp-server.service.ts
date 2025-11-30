import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import * as https from 'https';
import * as http from 'http';
import { Logger } from '@utils/logger';
import { metrics } from '@utils/metrics';
import { ProtocolFactory } from '../protocols/protocol.factory';
import { ConnectionManagerService } from '../connection-manager/connection-manager.service';
import { DeviceService } from '../device/device.service';
import { DataForwarderService } from '../data-forwarder/data-forwarder.service';
import { PacketType } from '../protocols/base/decoder.interface';
import { PrismaClient } from '@prisma/client';

interface SocketBuffer {
  buffer: Buffer;
  imei?: string;
}

// Extend Socket interface to include imei property
interface ExtendedSocket extends net.Socket {
  imei?: string;
}

@Injectable()
export class TcpServerService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(TcpServerService.name);
  private servers: Map<number, net.Server> = new Map();
  private socketBuffers: Map<ExtendedSocket, SocketBuffer> = new Map();
  private isShuttingDown = false;
  private prisma = new PrismaClient();

  constructor(
    private configService: ConfigService,
    private protocolFactory: ProtocolFactory,
    private connectionManager: ConnectionManagerService,
    private deviceService: DeviceService,
    private dataForwarder: DataForwarderService,
  ) { }

  async onModuleInit() {
    // Connect to database
    try {
      await this.prisma.$connect();
      this.logger.log('Prisma database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', (error as Error).stack);
      throw error;
    }

    const ports = this.protocolFactory.getAllPorts();

    for (const port of ports) {
      await this.startServer(port);
    }
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    await this.stopAllServers();
    await this.prisma.$disconnect();
  }

  /**
   * Start TCP server on specified port
   */
  private async startServer(port: number): Promise<void> {
    const protocol = this.protocolFactory.getProtocolNameByPort(port);

    if (!protocol) {
      this.logger.error(`No protocol configured for port ${port}`);
      return;
    }

    const server = net.createServer((socket) => {
      this.handleConnection(socket as ExtendedSocket, port, protocol);
    });

    // Server configuration for high performance
    server.maxConnections = this.configService.get<number>('app.connection.maxConnectionsPerPort', 50000);

    server.on('error', (error) => {
      this.logger.error(`Server error on port ${port}`, error.stack);
    });

    server.on('close', () => {
      this.logger.log(`Server closed on port ${port}`);
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(port, '0.0.0.0', () => {
        this.logger.log(`TCP Server started on port ${port} for protocol ${protocol}`);
        resolve();
      });

      server.on('error', reject);
    });

    this.servers.set(port, server);
    metrics.activeConnections.set({ protocol, port: port.toString() }, 0);
  }

  /**
   * Handle new socket connection
   */
  private handleConnection(socket: ExtendedSocket, port: number, protocol: string): void {
    const remoteAddress = socket.remoteAddress || 'unknown';
    const remotePort = socket.remotePort || 0;
    const connectionId = `${remoteAddress}:${remotePort}`;

    this.logger.debug(`New connection from ${connectionId} on port ${port}`);

    // Initialize buffer for this socket
    this.socketBuffers.set(socket, { buffer: Buffer.alloc(0) });

    // Update metrics
    metrics.totalConnections.inc({ protocol, port: port.toString() });
    metrics.activeConnections.inc({ protocol, port: port.toString() });

    // Socket configuration
    socket.setKeepAlive(true, this.configService.get<number>('app.connection.keepAliveTimeout', 120000));
    socket.setNoDelay(true);
    socket.setTimeout(this.configService.get<number>('app.connection.socketTimeout', 300000));

    // Initialize imei
    socket.imei = '';


    // Handle incoming data
    socket.on('data', async (data) => {
     
      const parsedData = await this.handleData(socket, data, port, protocol);
      
      console.log('Connection ID:', connectionId);

      if (parsedData) {

        if (parsedData?.packetTypes?.includes("LOGIN")) {          
          socket.imei = parsedData.deviceData[0]?.imei || '';
          console.log('Socket IMEI set to:', socket.imei);
          return;
        }
          
          // Check if IMEI exists in database using Prisma devices table
          if (socket.imei) {
            const isValidImei = await this.validateImei(socket.imei);
            
            if (isValidImei) {
              this.logger.log(`Device validated successfully: ${socket.imei}`);
              // Forward data using non-blocking POST request
              this.forwardDataAsync(parsedData);
            } else {
              this.logger.warn(`Device validation failed: ${socket.imei}`);
              console.log('Device not found in database for IMEI:', socket.imei);
              // Optionally close connection for unauthorized devices
               socket.destroy();
            }
          }
       

      }





    });

    // Handle socket close
    socket.on('close', (hadError) => {
      this.handleDisconnection(socket, port, protocol, hadError ? 'error' : 'normal');
    });

    // Handle socket error
    socket.on('error', (error) => {
      this.logger.error(`Socket error for ${connectionId}`, error.message);
      metrics.disconnections.inc({ protocol, port: port.toString(), reason: 'error' });
    });

    // Handle timeout
    socket.on('timeout', () => {
      this.logger.warn(`Socket timeout for ${connectionId}`);
      socket.destroy();
      metrics.disconnections.inc({ protocol, port: port.toString(), reason: 'timeout' });
    });
  }

  /**
   * Handle incoming data from socket
   * @returns Parsed data information including packet types and device data
   */
  private async handleData(
    socket: ExtendedSocket,
    data: Buffer,
    port: number,
    protocol: string,
  ): Promise<{ packetsProcessed: number; packetTypes: string[]; deviceData: any[] } | null> {
    const socketBuffer = this.socketBuffers.get(socket);
    if (!socketBuffer) return null;

    // Append new data to buffer
    socketBuffer.buffer = Buffer.concat([socketBuffer.buffer, data]);

    // Get decoder based on port
    const decoder = this.protocolFactory.getDecoderByPort(port);
    if (!decoder) return null;

    const result = {
      packetsProcessed: 0,
      packetTypes: [] as string[],
      deviceData: [] as any[],
    };

    // Process all complete packets in buffer
    while (decoder.hasCompletePacket(socketBuffer.buffer)) {
      const packetLength = decoder.getPacketLength(socketBuffer.buffer);
      if (packetLength === 0) break;

      const packetData = socketBuffer.buffer.slice(0, packetLength);
      socketBuffer.buffer = socketBuffer.buffer.slice(packetLength);

      try {
        // Decode packet
        const decodedPacket = decoder.decode(packetData, socket);
        if (!decodedPacket) continue;

        result.packetsProcessed++;
        result.packetTypes.push(decodedPacket.type);

        // Store IMEI for future packets
        if (decodedPacket.imei) {
          socketBuffer.imei = decodedPacket.imei;
        }

        // Transform to device data format
        const deviceData = decoder.transformToDeviceData(decodedPacket);
        if (deviceData) {
          result.deviceData.push(deviceData);
        }

        // Send acknowledgment if required
        if (decodedPacket.requiresAck) {
          const ack = decoder.generateAck(decodedPacket);
          if (ack) {
            socket.write(ack);
          }
        }

      } catch (error) {
        this.logger.error('Error processing packet', (error as Error).stack);
      }
    }

    return result.packetsProcessed > 0 ? result : null;
  }

  /**
   * Forward data asynchronously without blocking
   */
  private forwardDataAsync(data: any): void {
    const forwardUrl = process.env.DATA_FORWARD;
    
    if (!forwardUrl) {
      this.logger.warn('DATA_FORWARD environment variable not set');
      return;
    }

    try {
      const postData = JSON.stringify(data);
      const url = new URL(forwardUrl);
      const isHttps = url.protocol === 'https:';
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${process.env.SECRET_KEY}`
        },
        timeout: 5000 // 5 second timeout
      };

      const httpModule = isHttps ? https : http;
      
      const req = httpModule.request(options, (res) => {
        // Consume response data to free memory
        res.on('data', () => {});
        res.on('end', () => {
          this.logger.debug(`Data forwarded successfully to ${forwardUrl}`);
        });
      });

      req.on('error', (error) => {
        this.logger.error(`Failed to forward data to ${forwardUrl}`, error.message);
      });

      req.on('timeout', () => {
        this.logger.warn(`Request timeout while forwarding to ${forwardUrl}`);
        req.destroy();
      });

      // Write data and end request
      req.write(postData);
      req.end();
      
    } catch (error) {
      this.logger.error('Error creating forward request', (error as Error).message);
    }
  }

  /**
   * Validate IMEI exists in database
   */
  private async validateImei(imei: string): Promise<boolean> {
    try {
      const device = await this.prisma.devices.findUnique({
        where: {
          imei: imei
        }
      });    
      
      
      return device !== null;
    } catch (error) {
      this.logger.error(`Database error while validating IMEI ${imei}`, (error as Error).stack);
      return false;
    }
  }

  /**
   * Handle login packet
   */
  private async handleLoginPacket(
    socket: ExtendedSocket,
    imei: string,
    port: number,
    protocol: string,
  ): Promise<void> {
    this.logger.log(`Device logged in: ${imei} on ${protocol}`);

    // Store connection
    await this.connectionManager.storeConnection({
      imei,
      protocol,
      port,
      remoteAddress: socket.remoteAddress || 'unknown',
      remotePort: socket.remotePort || 0,
      connectedAt: new Date(),
      lastActivity: new Date(),
    });
  }

  /**
   * Handle socket disconnection
   */
  private handleDisconnection(
    socket: ExtendedSocket,
    port: number,
    protocol: string,
    reason: string,
  ): void {
    const socketBuffer = this.socketBuffers.get(socket);
    const imei = socketBuffer?.imei;

    if (imei) {
      this.logger.debug(`Device disconnected: ${imei}`, { reason });
      this.connectionManager.removeConnection(imei);
    }

    this.socketBuffers.delete(socket);
    metrics.activeConnections.dec({ protocol, port: port.toString() });
    metrics.disconnections.inc({ protocol, port: port.toString(), reason });
  }

  /**
   * Stop all servers gracefully
   */
  private async stopAllServers(): Promise<void> {
    this.logger.log('Stopping all TCP servers...');

    const closePromises = Array.from(this.servers.entries()).map(([port, server]) => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          this.logger.log(`Server stopped on port ${port}`);
          resolve();
        });
      });
    });

    await Promise.all(closePromises);
    this.servers.clear();
    this.logger.log('All TCP servers stopped');
  }

  /**
   * Get server statistics
   */
  getServerStats() {
    return {
      activeServers: this.servers.size,
      ports: Array.from(this.servers.keys()),
      activeConnections: this.socketBuffers.size,
    };
  }
}
