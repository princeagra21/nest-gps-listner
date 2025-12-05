# AI Coding Reference - NestJS GPS Tracking System

## Project Overview

A **production-ready**, high-performance **NestJS TCP server** for GPS device tracking that handles **100K+ concurrent connections**. Built with clean architecture principles, this system processes multiple GPS protocols (GT06, Teltonika) via TCP connections, validates devices, processes location data, and forwards it to external APIs in real-time.

**Key Highlights:**
- 🏗️ Clean Architecture with modular, maintainable design
- ⚡ High-performance Fastify HTTP adapter
- 🔌 Multi-protocol TCP server with factory pattern
- 📡 Redis-based connection state management
- 🗄️ PostgreSQL with Prisma ORM
- 📊 Real-time data forwarding
- 🔐 JWT Bearer authentication for API endpoints
- 📝 Structured logging with Winston
- 🐳 Docker-ready with docker-compose

---

## Technology Stack

### Core Framework
- **Runtime**: Node.js 20+
- **Framework**: NestJS v10.3.0 (TypeScript 5.3)
- **HTTP Adapter**: Fastify (optimized for 100K+ concurrent connections)

### Data Layer
- **Database**: PostgreSQL 12+ with Prisma ORM v5.7.1
- **Cache**: Redis v5.3.2 (ioredis client)
- **ORM Features**: Connection pooling, migrations, type-safe queries

### Communication & Processing
- **TCP Servers**: Native Node.js `net` module (multi-port)
- **HTTP Client**: Axios via @nestjs/axios
- **Scheduling**: @nestjs/schedule for background jobs

### Infrastructure & DevOps
- **Logging**: Winston v3.11 with daily file rotation (winston-daily-rotate-file)
- **Validation**: class-validator, class-transformer, Joi
- **Containerization**: Docker & Docker Compose
- **Monitoring**: Health check endpoints

### Protocol Processing
- **CRC Validation**: crc v4.3.2 for packet integrity
- **Binary Parsing**: Native Node.js Buffer operations
- **Custom Decoders**: GT06 & Teltonika protocol implementations

---

## Project Structure (Clean Architecture)

```
e:\2026\Listner-Nest/
├── prisma/
│   ├── schema.prisma              # Database schema (DeviceStatus, CommandQueue, User, etc.)
│   └── migrations/                # Database version control
│
├── src/
│   ├── main.ts                    # Application bootstrap (Fastify config, CORS, pipes)
│   ├── app.module.ts              # Root module orchestration
│   │
│   ├── config/                    # Configuration Layer
│   │   ├── configuration.ts       # Namespaced config (registerAs pattern)
│   │   └── validation.schema.ts   # Joi environment validation schema
│   │
│   ├── types/                     # Shared Type Definitions
│   │   ├── socket-meta.ts         # SocketWithMeta, SocketMeta interfaces
│   │   └── devicestatus.ts        # DeviceConnectionStatus, DeviceStatusPayload
│   │
│   ├── utils/                     # Infrastructure Utilities
│   │   ├── logger.ts              # Winston logger factory & Logger class
│   │   ├── redisstart.ts          # OS-specific Redis auto-start utility
│   │   ├── executecommands.ts     # Command execution helper
│   │   └── identifyos.ts          # OS detection utility
│   │
│   └── modules/                   # Feature Modules (Clean Architecture)
│       │
│       ├── sqlconnection/         # Data Access Layer (Global)
│       │   ├── prisma.module.ts   # @Global() module for DI
│       │   └── prisma.service.ts  # PrismaClient wrapper (singleton)
│       │
│       ├── connection-manager/    # Redis State Management
│       │   ├── connection-manager.module.ts
│       │   ├── connection-manager.service.ts  # Redis client, connection tracking
│       │   └── interfaces/
│       │       └── connection.interface.ts    # ConnectionInfo, ConnectionStats
│       │
│       ├── common/                # Shared Business Logic
│       │   ├── common.module.ts
│       │   └── common.service.ts  # validateImei, updateDeviceLiveStatus, helpers
│       │
│       ├── protocols/             # Protocol Processing Layer (Factory Pattern)
│       │   ├── protocol.factory.ts           # Port-to-protocol service mapper
│       │   ├── protocols.module.ts
│       │   ├── base/                         # Abstract Protocol Foundation
│       │   │   ├── decoder.interface.ts      # IProtocolDecoder contract
│       │   │   └── base-decoder.abstract.ts  # Shared utilities (CRC, validation)
│       │   ├── gt06/                         # GT06 Protocol Implementation
│       │   │   ├── gt06.service.ts           # Complete service (decode/encode/process)
│       │   │   └── gt06.types.ts             # Protocol-specific types
│       │   └── teltonika/                    # Teltonika Protocol Implementation
│       │       ├── teltonika.service.ts      # Complete service (decode/encode/process)
│       │       └── teltonika.types.ts        # Protocol-specific types
│       │
│       ├── tcp-server/            # TCP Connection Layer
│       │   ├── tcp-server.module.ts
│       │   └── tcp-server.service.ts  # Multi-port server, buffer management, socket lifecycle
│       │
│       ├── data-forwarder/        # External Integration Layer
│       │   ├── data-forwarder.module.ts
│       │   └── data-forwarder.service.ts  # Fire-and-forget HTTP POST forwarding
│       │
│       ├── autosync/              # Background Job Layer
│       │   ├── autosync.module.ts
│       │   └── autosync.service.ts  # Scheduled sync: IMEI list, status hash, commands
│       │
│       └── api/                   # HTTP API Layer
│           ├── api.module.ts
│           ├── api.controller.ts  # REST endpoints (health, info, commands)
│           ├── api.service.ts     # API business logic
│           └── guard/
│               └── bearer-auth.guard.ts  # JWT Bearer authentication
│
├── docker-compose.yml             # Multi-container orchestration
├── Dockerfile                     # Production-ready image
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
└── nest-cli.json                  # NestJS CLI configuration
```

---

## Architecture Principles

### 1. Clean Architecture Layers
```
┌─────────────────────────────────────────────┐
│         HTTP API Layer (Fastify)            │
│  Controllers, Guards, DTOs, REST endpoints  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│        Application/Service Layer            │
│   Business logic, data transformation       │
│   (API Service, Protocol Services)          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Infrastructure Layer                │
│  Database (Prisma), Cache (Redis),          │
│  External APIs, TCP Servers                 │
└─────────────────────────────────────────────┘
```

### 2. Dependency Flow
- **Inward dependencies only**: Outer layers depend on inner layers
- **Dependency Injection**: NestJS DI container manages all services
- **Global modules**: PrismaModule, ConfigModule, CommonModule
- **Single Responsibility**: Each module has one clear purpose

### 3. Protocol Strategy Pattern
- **Factory Pattern**: `ProtocolFactory` maps ports to protocol services
- **Service-Based**: Complete protocol logic encapsulated in single service
- **Extensibility**: Add new protocols by creating new service + factory registration

---

## Module Architecture Descriptions

### Core Infrastructure Modules

#### 1. **`/sqlconnection`** - Prisma PostgreSQL Connection
- **Purpose**: Global database connection management
- **Key Files**: `prisma.service.ts`, `prisma.module.ts`
- **Pattern**: `@Global()` module, extends `PrismaClient`, implements `OnModuleInit` and `OnModuleDestroy`
- **Usage**: Inject `PrismaService` into any service via constructor DI
- **Important**: Always use this shared service, never instantiate `new PrismaClient()` directly

```typescript
// Correct usage
constructor(private prisma: PrismaService) {}
```

#### 2. **`/connection-manager`** - Redis Connection Management
- **Purpose**: Manages Redis connections for caching device states, connection metadata
- **Key Files**: `connection-manager.service.ts`
- **Features**: Connection tracking, device status management, IMEI-to-socket mapping
- **Redis Key Patterns**:
  - `device:<imei>` - Connection info
  - `active_devices` - Set of active IMEIs
  - `devices:commands:<imei>` - Command queue per device

#### 3. **`/tcp-server`** - TCP Server Management
- **Purpose**: Listens for device connections on multiple ports (5023 GT06, 5024 Teltonika)
- **Key Files**: `tcp-server.service.ts`
- **Pattern**: Creates multiple `net.Server` instances, handles socket lifecycle
- **Features**: Buffer management, protocol detection via port, graceful shutdown

#### 4. **`/device`** - Device Management
### 1. **Data Access Layer** - `/sqlconnection`

**Purpose**: Global PostgreSQL database connection management

**Key Files**: 
- `prisma.module.ts` - Global module registration
- `prisma.service.ts` - PrismaClient wrapper with lifecycle hooks

**Architecture Pattern**: 
```typescript
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**Usage Guidelines**:
- ✅ **ALWAYS** inject `PrismaService` via constructor DI
- ❌ **NEVER** instantiate `new PrismaClient()` directly
- Connection pooling managed automatically
- Single shared instance across entire application

```typescript
// Correct usage
constructor(private readonly prisma: PrismaService) {}

async findDevice(imei: string) {
  return this.prisma.deviceStatus.findUnique({ where: { imei } });
}
```

---

### 2. **Cache Layer** - `/connection-manager`

**Purpose**: Redis-based connection state, device status, and command queue management

**Key Files**:
- `connection-manager.service.ts` - Redis client lifecycle & operations
- `connection.interface.ts` - ConnectionInfo, ConnectionStats types

**Architecture Pattern**:
```typescript
@Injectable()
export class ConnectionManagerService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;
  private readonly TTL = 3600; // 1 hour
  
  async onModuleInit() {
    // Initialize Redis with auto-start capability
    await this.initializeRedis(redisConfig);
  }
  
  getRedisClient(): Redis {
    return this.redisClient;
  }
}
```

**Redis Key Structure** (from `config/configuration.ts`):
```typescript
rediskeys: {
  deviceImeiSet: 'devices:imei:set',           // SET - All valid device IMEIs
  deviceStatusHash: 'devices:status',          // HASH - Live device status
  commandQueuePrefix: 'devices:commands:',     // LIST - Command queues (per IMEI)
}
```

**Key Features**:
- Auto-start Redis service on connection failure (OS-specific via `redisstart.ts`)
- Shared Redis client exposed via `getRedisClient()`
- TTL-based expiration for connection metadata
- Graceful reconnection with exponential backoff

**Usage Example**:
```typescript
constructor(private readonly connectionManager: ConnectionManagerService) {}

private get redis() {
  return this.connectionManager.getRedisClient();
}

async isValidDevice(imei: string): Promise<boolean> {
  return (await this.redis.sismember('devices:imei:set', imei)) === 1;
}
```

---

### 3. **Protocol Processing Layer** - `/protocols`

**Purpose**: Complete protocol handling with factory pattern for extensibility

**Architecture Components**:

#### A. **Protocol Factory** (`protocol.factory.ts`)
Maps TCP ports to protocol service instances:
```typescript
@Injectable()
export class ProtocolFactory {
  private decoderMap: Map<number, IProtocolDecoder> = new Map();
  
  constructor(
    private gt06Service: GT06Service,
    private teltonikaService: TeltonikaService,
  ) {
    this.initializeDecoders(); // Port-to-service mapping
  }
  
  getDecoderByPort(port: number): IProtocolDecoder | null { }
  getProcessByPort(port: number): ProcessFunction | null { }
  getProtocolNameByPort(port: number): string | null { }
}
```

#### B. **Base Protocol Interface** (`base/decoder.interface.ts`)
Standard contract for all protocols:
```typescript
export enum PacketType {
  LOGIN = 'LOGIN',
  HEARTBEAT = 'HEARTBEAT',
  LOCATION = 'LOCATION',
  ALARM = 'ALARM',
  STATUS = 'STATUS',
  UNKNOWN = 'UNKNOWN',
}

export interface IProtocolDecoder {
  readonly protocolName: string;
  
  // Core decoder methods
  decode(buffer: Buffer, socket: Socket): DecodedPacket | null;
  generateAck(packet: DecodedPacket): Buffer | null;
  transformToDeviceData(packet: DecodedPacket): DeviceData | null;
  
  // Buffer management
  hasCompletePacket(buffer: Buffer): boolean;
  getPacketLength(buffer: Buffer): number;
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
```

#### C. **Abstract Base Decoder** (`base/base-decoder.abstract.ts`)
Shared utilities for all protocol implementations:
```typescript
export abstract class BaseDecoder implements IProtocolDecoder {
  protected logger: Logger;
  abstract readonly protocolName: string;
  readonly requiresDeviceValidation: boolean = true;
  
  // Abstract methods (must implement)
  abstract decode(buffer: Buffer, socket: Socket): DecodedPacket | null;
  abstract generateAck(packet: DecodedPacket): Buffer | null;
  abstract transformToDeviceData(packet: DecodedPacket): DeviceData | null;
  abstract hasCompletePacket(buffer: Buffer): boolean;
  abstract getPacketLength(buffer: Buffer): number;
  
  // Shared utilities
  protected validateImei(imei: string): boolean { }
  protected parseCoordinates(lat: number, lon: number): LocationData { }
  protected calculateCRC(buffer: Buffer): number { }
}
```

#### D. **Protocol Services** (Complete Implementation Pattern)
Each protocol service is **self-contained** with all logic in one place:

```typescript
@Injectable()
export class GT06Service extends BaseDecoder {
  readonly protocolName = 'GT06';
  
  constructor(
    private readonly dataForwarder: DataForwarderService,
    private readonly commonService: CommonService,
  ) { super(); }
  
  // ===== DECODER METHODS =====
  decode(buffer: Buffer, socket: Socket): DecodedPacket | null {
    // Parse GT06 binary protocol
  }
  
  generateAck(packet: DecodedPacket): Buffer | null {
    // Generate protocol-specific acknowledgment
  }
  
  transformToDeviceData(packet: DecodedPacket): DeviceData | null {
    // Transform to standard DeviceData format
  }
  
  hasCompletePacket(buffer: Buffer): boolean {
    // Check if buffer contains complete packet
  }
  
  getPacketLength(buffer: Buffer): number {
    // Extract packet length from header
  }
  
  // ===== ENCODER METHODS =====
  encodeCommand(command: string, serialNumber?: number): Buffer | null {
    // Encode command string to binary protocol
  }
  
  sendCommand(socket: Socket, command: string): Promise<boolean> {
    // Send encoded command to device
  }
  
  // ===== PROCESSING ORCHESTRATION =====
  async processData(socket: SocketWithMeta, parsedData: any, port: number): Promise<void> {
    // Validate device → Update Redis → Forward data
    const isValid = await this.commonService.validateImei(parsedData.imei);
    if (!isValid) return;
    
    await this.commonService.updateDeviceLiveStatus({ imei: parsedData.imei, ... });
    this.dataForwarder.forwardData(deviceData); // Fire-and-forget
  }
}
```

**Benefits of Service-Based Architecture**:
- ✅ **Cohesion**: All protocol logic (decode/encode/process) in single class
- ✅ **Encapsulation**: Internal state and dependencies managed per protocol
- ✅ **Testability**: Easy to mock dependencies and test in isolation
- ✅ **Extensibility**: Add new protocol = Create new service + Register in factory
- ✅ **No fragmentation**: No separate decoder/encoder/processor files

**Adding New Protocol**:
1. Create `protocols/newprotocol/newprotocol.service.ts` extending `BaseDecoder`
2. Implement all abstract methods
3. Register in `protocol.factory.ts` constructor
4. Update `configuration.ts` with new port
5. Update `validation.schema.ts` with port validation

---

### 4. **TCP Connection Layer** - `/tcp-server`

**Purpose**: Multi-port TCP server managing 100K+ concurrent device connections

**Key Files**:
- `tcp-server.service.ts` - Server lifecycle, buffer management, socket handling

**Architecture Pattern**:
```typescript
@Injectable()
export class TcpServerService implements OnModuleInit, OnModuleDestroy {
  private servers: Map<number, net.Server> = new Map();
  private socketBuffers: Map<SocketWithMeta, SocketBuffer> = new Map();
  private connections = new Map<string, net.Socket>();
  private isShuttingDown = false;
  
  async onModuleInit() {
    const ports = this.protocolFactory.getAllPorts();
    for (const port of ports) {
      await this.startServer(port);
    }
  }
  
  private handleConnection(socket: SocketWithMeta, port: number, protocol: string) {
    // Initialize socket metadata
    socket.meta = {
      connectionId: `${remoteAddress}:${remotePort}`,
      imei: undefined,
      isAuthorized: false,
      createdAt: new Date(),
      lastPacketAt: undefined,
    };
    
    // Buffer accumulation pattern
    socket.on('data', (chunk) => this.handleData(socket, chunk, port));
    socket.on('error', (err) => this.handleError(socket, err));
    socket.on('close', () => this.handleClose(socket));
  }
}
```

**Socket Buffer Management**:
```typescript
interface SocketBuffer {
  buffer: Buffer;
  imei?: string;
}

private handleData(socket: SocketWithMeta, chunk: Buffer, port: number) {
  // Accumulate chunks in buffer
  socketBuffer.buffer = Buffer.concat([socketBuffer.buffer, chunk]);
  
  // Process complete packets
  while (decoder.hasCompletePacket(socketBuffer.buffer)) {
    const packet = decoder.decode(socketBuffer.buffer, socket);
    
    // Send ACK if required
    if (packet?.requiresAck) {
      const ack = decoder.generateAck(packet);
      if (ack) socket.write(ack);
    }
    
    // Process data asynchronously
    if (packet?.type === PacketType.LOCATION) {
      const processFunc = this.protocolFactory.getProcessByPort(port);
      processFunc(socket, packet, port); // Fire-and-forget
    }
    
    // Remove processed bytes from buffer
    socketBuffer.buffer = socketBuffer.buffer.slice(packetLength);
  }
}
```

**Performance Optimizations**:
- `maxConnections` per port (default: 50,000)
- Buffer reuse and slicing (avoid memory leaks)
- Fire-and-forget processing (non-blocking)
- Connection pooling with graceful shutdown

---

### 5. **Business Logic Layer** - `/common`

**Purpose**: Shared business logic for device validation, status updates, helpers

**Key Files**:
- `common.service.ts` - Central business logic utilities

**Architecture Pattern**:
```typescript
@Injectable()
export class CommonService {
  private readonly DEVICE_IMEI_SET_KEY: string;
  private readonly DEVICE_STATUS_HASH_KEY: string;
  private readonly COMMAND_QUEUE_KEY_PREFIX: string;
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectionManager: ConnectionManagerService,
    private readonly configService: ConfigService,
  ) {
    // Load Redis keys from global config
    this.DEVICE_IMEI_SET_KEY = this.configService.get('app.rediskeys.deviceImeiSet');
    this.DEVICE_STATUS_HASH_KEY = this.configService.get('app.rediskeys.deviceStatusHash');
    this.COMMAND_QUEUE_KEY_PREFIX = this.configService.get('app.rediskeys.commandQueuePrefix');
  }
  
  private get redisClient() {
    return this.connectionManager.getRedisClient();
  }
  
  // ===== CORE BUSINESS METHODS =====
  async validateImei(imei: string): Promise<boolean> {
    return (await this.redisClient.sismember(this.DEVICE_IMEI_SET_KEY, imei)) === 1;
  }
  
  async updateDeviceLiveStatus(payload: DeviceStatusPayload): Promise<void> {
    // Merge with existing data
    const existingJson = await this.redisClient.hget(this.DEVICE_STATUS_HASH_KEY, payload.imei);
    const merged = existingJson ? JSON.parse(existingJson) : { imei: payload.imei };
    
    // Update only provided fields
    Object.assign(merged, payload);
    
    // Single Redis write
    await this.redisClient.hset(
      this.DEVICE_STATUS_HASH_KEY,
      payload.imei,
      JSON.stringify(merged),
    );
  }
  
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Why CommonService?**
- Central place for business logic shared across modules
- Direct access to Redis via ConnectionManager
- Type-safe configuration access
- Reusable utilities (validation, delay, etc.)

---

### 6. **External Integration Layer** - `/data-forwarder`

**Purpose**: Fire-and-forget HTTP forwarding of GPS data to external APIs

**Key Files**:
- `data-forwarder.service.ts` - Async HTTP POST client

**Architecture Pattern**:
```typescript
@Injectable()
export class DataForwarderService {
  private forwardUrl: string;
  private readonly TIMEOUT = 5000;
  
  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.forwardUrl = this.configService.get<string>('app.dataForward.url')!;
  }
  
  forwardData(deviceData: DeviceData): void {
    // Non-blocking, fire-and-forget
    this.httpService.post(this.forwardUrl, deviceData).subscribe({
      error: () => {} // Silently ignore errors
    });
  }
}
```

**Design Decisions**:
- ❌ **No await** - Don't block TCP processing
- ❌ **No retry logic** - Prevents backpressure
- ❌ **Silent error handling** - GPS data forwarding failures don't stop tracking
- ✅ **Observable pattern** - RxJS for async HTTP

**Usage in Protocol Services**:
```typescript
async processData(socket: SocketWithMeta, parsedData: any, port: number) {
  const deviceData = this.transformToDeviceData(parsedData);
  this.dataForwarder.forwardData(deviceData); // Fire-and-forget
}
```

---

### 7. **Background Jobs Layer** - `/autosync`

**Purpose**: Scheduled synchronization between PostgreSQL and Redis

**Key Files**:
- `autosync.service.ts` - Interval-based sync jobs

**Architecture Pattern**:
```typescript
@Injectable()
export class AutosyncService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private redis: Redis;
  private isSyncing = false;
  
  async onApplicationBootstrap() {
    this.redis = this.connectionManager.getRedisClient();
    await this.syncInitialData(); // Startup sync
  }
  
  @Interval(5 * 60 * 1000) // Every 5 minutes
  async handleFiveMinuteSync() {
    if (this.isSyncing) return; // Prevent overlap
    
    this.isSyncing = true;
    try {
      await this.syncDeviceImeiList();    // PostgreSQL → Redis SET
      await this.syncDeviceStatusHash();  // PostgreSQL → Redis HASH
      await this.syncCommandQueues();     // PostgreSQL → Redis LISTs
    } finally {
      this.isSyncing = false;
    }
  }
  
  async beforeApplicationShutdown() {
    await this.finalSync(); // Ensure data consistency on shutdown
  }
}
```

**Sync Operations**:

1. **IMEI List Sync** (`devices:imei:set`):
   - Fetch all active device IMEIs from PostgreSQL
   - Refresh Redis SET for O(1) validation lookups
   
2. **Device Status Sync** (`devices:status` HASH):
   - Pull latest device status from PostgreSQL
   - Update Redis HASH for real-time status queries
   
3. **Command Queue Sync** (`devices:commands:<imei>` LISTs):
   - Fetch pending commands from PostgreSQL
   - Push to Redis LISTs per device
   - Protocol services pop commands and send to devices

**Why Interval-Based Sync?**
- PostgreSQL is source of truth
- Redis provides fast access for real-time operations
- Scheduled sync keeps cache fresh without constant DB queries
- Startup sync ensures immediate availability

---

### 8. **HTTP API Layer** - `/api`

**Purpose**: REST API for external integrations, monitoring, and management

**Key Files**:
- `api.controller.ts` - REST endpoints
- `api.service.ts` - API business logic
- `guard/bearer-auth.guard.ts` - JWT Bearer authentication

**Architecture Pattern**:
```typescript
@Controller('api')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}
  
  @Get('health')
  async getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
  
  @Get('info')
  getInfo() {
    return {
      name: 'ListnerNest GPS Tracker Server',
      version: '1.0.0',
      environment: process.env.NODE_ENV,
    };
  }
  
  @Post('commands/:imei')
  @UseGuards(BearerAuthGuard)
  async addCommand(@Param('imei') imei: string, @Body('command') command: string) {
    return await this.apiService.SendCommand(imei, command);
  }
}
```

**Bearer Auth Guard**:
```typescript
@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}
  
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) return false;
    
    const token = authHeader.substring(7);
    const secretKey = this.configService.get<string>('app.security.secretKey');
    
    return token === secretKey;
  }
}
```

**API Endpoints**:
- `GET /api/health` - Health check (no auth)
- `GET /api/info` - System information (no auth)
- `POST /api/commands/:imei` - Send command to device (Bearer auth required)

---

## Data Flow Architecture

### End-to-End Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         GPS DEVICE                                  │
│                   (GT06/Teltonika Hardware)                         │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Binary Protocol over TCP
                      │ (Port 5023 for GT06, 5024 for Teltonika)
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    TCP SERVER LAYER                                 │
│                  (TcpServerService)                                 │
│  - Accepts connections on multiple ports                            │
│  - Initializes socket metadata                                      │
│  - Accumulates binary data in buffers                               │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Raw Buffer
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  PROTOCOL FACTORY                                   │
│                 (ProtocolFactory)                                   │
│  - Maps port number to protocol decoder                             │
│  - Routes to appropriate service (GT06/Teltonika)                   │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Port-based routing
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              PROTOCOL DECODER SERVICE                               │
│            (GT06Service / TeltonikaService)                         │
│  1. hasCompletePacket() - Check buffer completeness                 │
│  2. decode() - Parse binary to DecodedPacket                        │
│  3. generateAck() - Create acknowledgment packet                    │
│  4. Send ACK back to device via socket.write()                      │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ DecodedPacket
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              VALIDATION & PROCESSING                                │
│                 (processData method)                                │
│  1. Validate IMEI via CommonService.validateImei()                  │
│  2. Check device in Redis SET (devices:imei:set)                    │
│  3. If invalid → Reject, close connection                           │
│  4. If valid → Continue processing                                  │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Validated DecodedPacket
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              DATA TRANSFORMATION                                    │
│          (transformToDeviceData method)                             │
│  - Convert protocol-specific format to standard DeviceData          │
│  - Extract: IMEI, Location, Speed, Course, Sensors, etc.            │
│  - Add timestamp and metadata                                       │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ DeviceData (standardized)
                      ├─────────────────┬─────────────────┐
                      ▼                 ▼                 ▼
            ┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
            │ REDIS UPDATE    │ │ DATA         │ │ METRICS UPDATE  │
            │ (CommonService) │ │ FORWARDING   │ │ (Prometheus)    │
            └─────────────────┘ └──────────────┘ └──────────────────┘
                      │                 │                 │
                      │                 │                 │
      Update status hash        Fire-and-forget    Increment counters
      (devices:status)          HTTP POST           (packets_processed)
                      │                 │                 │
                      ▼                 ▼                 ▼
            ┌─────────────────┐ ┌──────────────┐ ┌──────────────────┐
            │ Redis HASH      │ │ External API │ │ Monitoring       │
            │ (Live Status)   │ │ Webhook      │ │ Dashboard        │
            └─────────────────┘ └──────────────┘ └──────────────────┘
```

### Detailed Flow Breakdown

#### 1. **Connection Establishment**
```typescript
// Device connects → TCP Server accepts
handleConnection(socket: SocketWithMeta, port: number, protocol: string) {
  // Initialize socket metadata
  socket.meta = {
    connectionId: `${remoteAddress}:${remotePort}`,
    imei: undefined,
    isAuthorized: false,
    createdAt: new Date(),
    lastPacketAt: undefined,
  };
  
  // Register event handlers
  socket.on('data', (chunk) => this.handleData(socket, chunk, port));
  socket.on('error', (err) => this.handleError(socket, err));
  socket.on('close', () => this.handleClose(socket));
  
  // Update metrics
  metrics.totalConnections.inc({ protocol, port: port.toString() });
}
```

#### 2. **Data Reception & Buffering**
```typescript
// Data arrives in chunks → Accumulate in buffer
handleData(socket: SocketWithMeta, chunk: Buffer, port: number) {
  // Get or create socket buffer
  let socketBuffer = this.socketBuffers.get(socket);
  if (!socketBuffer) {
    socketBuffer = { buffer: Buffer.alloc(0), imei: undefined };
    this.socketBuffers.set(socket, socketBuffer);
  }
  
  // Accumulate chunk
  socketBuffer.buffer = Buffer.concat([socketBuffer.buffer, chunk]);
  
  // Process complete packets
  this.processBuffer(socket, socketBuffer, port);
}
```

#### 3. **Protocol Detection & Decoding**
```typescript
// Factory routes to appropriate decoder
const decoder = this.protocolFactory.getDecoderByPort(port);

// Check for complete packet
while (decoder.hasCompletePacket(socketBuffer.buffer)) {
  // Decode packet
  const packet = decoder.decode(socketBuffer.buffer, socket);
  
  // Send acknowledgment
  if (packet?.requiresAck) {
    const ack = decoder.generateAck(packet);
    if (ack) socket.write(ack);
  }
  
  // Process packet asynchronously (fire-and-forget)
  if (packet?.type === PacketType.LOCATION) {
    const processFunc = this.protocolFactory.getProcessByPort(port);
    processFunc(socket, packet, port); // Non-blocking
  }
  
  // Remove processed bytes
  const packetLength = decoder.getPacketLength(socketBuffer.buffer);
  socketBuffer.buffer = socketBuffer.buffer.slice(packetLength);
}
```

#### 4. **Device Validation**
```typescript
// Validate device against Redis cache
async processData(socket: SocketWithMeta, parsedData: any, port: number) {
  // Check if IMEI exists in Redis SET
  const isValid = await this.commonService.validateImei(parsedData.imei);
  
  if (!isValid) {
    this.logger.warn('⚠️ Device not authorized', { imei: parsedData.imei });
    socket.destroy(); // Close connection
    return;
  }
  
  // Continue processing...
}
```

#### 5. **Data Transformation**
```typescript
// Convert protocol-specific format to standard DeviceData
const deviceData: DeviceData = {
  imei: packet.imei,
  protocol: 'GT06',
  packetType: PacketType.LOCATION,
  location: {
    latitude: packet.latitude,
    longitude: packet.longitude,
    altitude: packet.altitude,
    speed: packet.speed,
    course: packet.course,
    satellites: packet.satellites,
    timestamp: packet.timestamp,
    valid: packet.gpsValid,
  },
  sensors: packet.sensors,
  status: packet.status,
  timestamp: new Date(),
  raw: packet.raw.toString('hex'),
};
```

#### 6. **Parallel Processing**
```typescript
// Three operations happen in parallel:

// A. Update Redis status (non-blocking)
this.commonService.updateDeviceLiveStatus({
  imei: deviceData.imei,
  status: 'CONNECTED',
  lat: deviceData.location.latitude,
  lon: deviceData.location.longitude,
  speed: deviceData.location.speed,
  course: deviceData.location.course,
  updatedAt: new Date(),
});

// B. Forward data to external API (fire-and-forget)
this.dataForwarder.forwardData(deviceData);

// C. Update Prometheus metrics
metrics.packetsProcessed.inc({ 
  protocol: deviceData.protocol,
  type: deviceData.packetType 
});
```

### Data Synchronization Flow (AutoSync)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    APPLICATION STARTUP                              │
│                 (onApplicationBootstrap)                            │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    INITIAL SYNC                                     │
│  1. Fetch all device IMEIs from PostgreSQL                          │
│  2. Load into Redis SET (devices:imei:set)                          │
│  3. Fetch device status from PostgreSQL                             │
│  4. Load into Redis HASH (devices:status)                           │
│  5. Fetch pending commands from PostgreSQL                          │
│  6. Load into Redis LISTs (devices:commands:<imei>)                 │
└─────────────────────┬───────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              PERIODIC SYNC (Every 5 minutes)                        │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  SYNC DEVICE IMEI LIST                                     │    │
│  │  - Query: SELECT imei FROM devices WHERE active = true     │    │
│  │  - Redis: SADD devices:imei:set <imei1> <imei2> ...       │    │
│  └────────────────────────────────────────────────────────────┘    │
│                             │                                       │
│                             ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  SYNC DEVICE STATUS                                        │    │
│  │  - Query: SELECT * FROM device_status                      │    │
│  │  - Redis: HSET devices:status <imei> <json_data>          │    │
│  └────────────────────────────────────────────────────────────┘    │
│                             │                                       │
│                             ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │  SYNC COMMAND QUEUES                                       │    │
│  │  - Query: SELECT * FROM command_queue WHERE sent = false   │    │
│  │  - Redis: RPUSH devices:commands:<imei> <command>         │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Repeat every 5 minutes
                      ▼
                  (Continuous Loop)
```

### Command Flow (Device Control)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  EXTERNAL CLIENT                                    │
│           (HTTP POST /api/commands/:imei)                           │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Bearer Token Auth
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 API CONTROLLER                                      │
│              (BearerAuthGuard check)                                │
│  - Validate Bearer token                                            │
│  - Extract IMEI and command from request                            │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ {imei, command}
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  API SERVICE                                        │
│  1. Insert command into PostgreSQL (command_queue table)            │
│  2. Push command to Redis LIST (devices:commands:<imei>)            │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Command stored
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              TCP SERVER (Background Check)                          │
│  - Periodically checks Redis LIST for pending commands              │
│  - LPOP devices:commands:<imei>                                     │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Command retrieved
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│              PROTOCOL SERVICE                                       │
│           (encodeCommand + sendCommand)                             │
│  1. Encode command to protocol-specific binary format               │
│  2. Find active socket for IMEI                                     │
│  3. socket.write(encodedCommand)                                    │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ Binary command
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GPS DEVICE                                       │
│              (Receives and executes command)                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Error Handling Flow

```
                      Error Occurs
                          │
                          ▼
            ┌─────────────────────────────┐
            │   Error Type Classification  │
            └──────────┬──────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    ┌────────┐   ┌─────────┐   ┌─────────┐
    │Expected│   │Network  │   │Critical │
    │Failure │   │Error    │   │Error    │
    └────┬───┘   └────┬────┘   └────┬────┘
         │            │             │
         ▼            ▼             ▼
    ┌────────┐   ┌─────────┐   ┌─────────┐
    │Log     │   │Log      │   │Log      │
    │WARN    │   │ERROR    │   │ERROR    │
    └────┬───┘   └────┬────┘   └────┬────┘
         │            │             │
         ▼            ▼             ▼
    ┌────────┐   ┌─────────┐   ┌─────────┐
    │Return  │   │Retry    │   │Throw    │
    │null    │   │or null  │   │Error    │
    └────────┘   └─────────┘   └─────────┘
         │            │             │
         ▼            ▼             ▼
    Continue     Update       Application
    Processing   Metrics      Shutdown
```

---

## Configuration Management

### Environment Variables (`config/configuration.ts`)

**Pattern**: Namespaced configuration using `registerAs`

```typescript
export default registerAs('app', () => ({
  database: {
    url: process.env.PRIMARY_DATABASE_URL,
    poolSize: parseInt(process.env.DB_POOL_SIZE || '50', 10),
  },
  ports: {
    gt06: parseInt(process.env.GT06_PORT || '5023', 10),
    teltonika: parseInt(process.env.TELTONIKA_PORT || '5024', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  // ... grouped by domain
}));
```

**Access Pattern**:
```typescript
constructor(private configService: ConfigService) {}

// Always specify type and provide default
const port = this.configService.get<number>('app.ports.gt06', 5023);
const dbUrl = this.configService.get<string>('app.database.url');
```

### Validation Schema (`config/validation.schema.ts`)

**Pattern**: Joi schema with defaults, type coercion, enum validation

```typescript
export const validationSchema = Joi.object({
  // Database
  PRIMARY_DATABASE_URL: Joi.string().required(),
  DB_POOL_SIZE: Joi.number().default(50),
  
  // TCP Ports
  GT06_PORT: Joi.number().default(5023),
  TELTONIKA_PORT: Joi.number().default(5024),
  
  // Connection Config
  CON_TIME_OUT: Joi.number().default(5000),
  SOCKET_TIMEOUT: Joi.number().default(300000),
  
  // Security
  SECRET_KEY: Joi.string().required(),
  
  // Data Forwarding
  DATA_FORWARD_URL: Joi.string().uri().required(),
  
  // API
  API_PORT: Joi.number().default(5055),
  
  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  
  // Environment
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),
});
```

**Complete Configuration Structure**:
```typescript
{
  database: {
    url: string,
    poolSize: number
  },
  ports: {
    gt06: number,
    teltonika: number
  },
  connection: {
    timeout: number,
    socketTimeout: number,
    keepAliveTimeout: number,
    maxConnectionsPerPort: number
  },
  security: {
    secretKey: string
  },
  dataForward: {
    url: string
  },
  api: {
    port: number
  },
  redis: {
    host: string,
    port: number,
    password?: string,
    db: number
  },
  rediskeys: {
    deviceImeiSet: 'devices:imei:set',
    deviceStatusHash: 'devices:status',
    commandQueuePrefix: 'devices:commands:'
  },
  nodeEnv: string,
  logs: {
    enabled: boolean,
    level: string
  }
}
```

---

## Coding Standards & Best Practices

### 1. File Naming Conventions

| Type | Pattern | Examples |
|------|---------|----------|
| **Module** | `<feature>.module.ts` | `tcp-server.module.ts`, `protocols.module.ts` |
| **Service** | `<feature>.service.ts` | `gt06.service.ts`, `data-forwarder.service.ts` |
| **Controller** | `<feature>.controller.ts` | `api.controller.ts` |
| **Guard** | `<name>-auth.guard.ts` | `bearer-auth.guard.ts` |
| **Interface** | `<feature>.interface.ts` | `connection.interface.ts`, `decoder.interface.ts` |
| **Types** | `<feature>.types.ts` OR `<feature>.ts` | `gt06.types.ts`, `socket-meta.ts`, `devicestatus.ts` |
| **Abstract** | `base-<feature>.abstract.ts` | `base-decoder.abstract.ts` |
| **Utility** | `<utility>.ts` | `logger.ts`, `redisstart.ts`, `executecommands.ts` |
| **Config** | `<config>.ts` | `configuration.ts`, `validation.schema.ts` |
| **Factory** | `<feature>.factory.ts` | `protocol.factory.ts` |

### 2. Class Naming Conventions

```typescript
// ===== Services (Business Logic) =====
export class TcpServerService { }
export class GT06Service extends BaseDecoder { }
export class CommonService { }
export class DataForwarderService { }

// ===== Controllers (API Endpoints) =====
export class ApiController { }

// ===== Modules (Feature Boundaries) =====
export class ProtocolsModule { }
export class ConnectionManagerModule { }

// ===== Guards (Authentication/Authorization) =====
export class BearerAuthGuard implements CanActivate { }

// ===== Factories (Object Creation) =====
export class ProtocolFactory { }

// ===== Interfaces (Contracts) =====
export interface IProtocolDecoder { }
export interface ConnectionInfo { }
export interface DeviceData { }

// ===== Enums (Constants) =====
export enum PacketType {
  LOGIN = 'LOGIN',
  HEARTBEAT = 'HEARTBEAT',
  LOCATION = 'LOCATION',
}

// ===== Type Aliases =====
export type SocketWithMeta = net.Socket & { meta: SocketMeta };
export type DeviceConnectionStatus = 'CONNECTED' | 'DISCONNECTED';
```

### 3. Variable & Method Naming

**camelCase for variables and methods**:
```typescript
// ===== Private Fields =====
private redisClient: Redis;
private socketBuffers: Map<SocketWithMeta, SocketBuffer>;
private isShuttingDown: boolean;

// ===== Public Methods =====
async validateImei(imei: string): Promise<boolean> { }
async forwardData(data: DeviceData): Promise<void> { }
getDecoderByPort(port: number): IProtocolDecoder | null { }

// ===== Private Methods =====
private handleConnection(socket: SocketWithMeta, port: number): void { }
private parseBuffer(buffer: Buffer): DecodedPacket | null { }
private initializeDecoders(): void { }

// ===== Boolean Predicates (is/has/can prefix) =====
isConnected(): boolean { }
hasCompletePacket(buffer: Buffer): boolean { }
canProcess(packet: DecodedPacket): boolean { }

// ===== Getters (get prefix) =====
getRedisClient(): Redis { }
getActiveDevices(): Set<string> { }
getProtocolNameByPort(port: number): string | null { }
```

**UPPER_SNAKE_CASE for constants**:
```typescript
// Class-level constants
private static readonly DEFAULT_TIMEOUT = 30000;
private static readonly MAX_BUFFER_SIZE = 8192;
private readonly TTL = 3600; // 1 hour

// Module-level constants (from config)
private readonly DEVICE_IMEI_SET_KEY: string;
private readonly DEVICE_STATUS_HASH_KEY: string;
private readonly COMMAND_QUEUE_KEY_PREFIX: string;
```

### 4. TypeScript Best Practices

#### A. **Strict Type Safety**
```typescript
// ✅ GOOD: Explicit return types
async validateDevice(imei: string): Promise<boolean> {
  return (await this.redis.sismember(this.DEVICE_IMEI_SET_KEY, imei)) === 1;
}

// ✅ GOOD: Null handling
getDecoderByPort(port: number): IProtocolDecoder | null {
  return this.decoderMap.get(port) ?? null;
}

// ✅ GOOD: Type guards
if (packet?.type === PacketType.LOCATION && packet.location) {
  // packet.location is guaranteed to exist
}

// ❌ BAD: Any types
decode(buffer: any): any { } // Avoid!
```

#### B. **Readonly Properties**
```typescript
// ✅ GOOD: Readonly for immutable properties
export abstract class BaseDecoder implements IProtocolDecoder {
  abstract readonly protocolName: string;
  readonly requiresDeviceValidation: boolean = true;
}

// ✅ GOOD: Readonly constructor parameters
constructor(
  private readonly prisma: PrismaService,
  private readonly configService: ConfigService,
) {}
```

#### C. **Proper Error Handling**
```typescript
// ✅ GOOD: Specific error handling
try {
  await this.prisma.device.findUnique({ where: { imei } });
} catch (error) {
  this.logger.error(
    `Failed to validate device: ${imei}`,
    error instanceof Error ? error.stack : String(error)
  );
  throw error;
}

// ✅ GOOD: Fire-and-forget with error suppression (when appropriate)
forwardData(deviceData: DeviceData): void {
  this.httpService.post(this.forwardUrl, deviceData).subscribe({
    error: () => {} // Intentional: Don't block on forwarding errors
  });
}
```

### 5. Dependency Injection Patterns

```typescript
// ✅ GOOD: Constructor injection with readonly
@Injectable()
export class GT06Service extends BaseDecoder {
  constructor(
    private readonly dataForwarder: DataForwarderService,
    private readonly commonService: CommonService,
  ) {
    super();
  }
}

// ✅ GOOD: Property getter for lazy access
export class CommonService {
  constructor(
    private readonly connectionManager: ConnectionManagerService,
  ) {}
  
  private get redisClient() {
    return this.connectionManager.getRedisClient();
  }
}

// ❌ BAD: Direct instantiation
const prisma = new PrismaClient(); // Never do this!
```

### 6. Module Organization

```typescript
// ✅ GOOD: Clear module boundaries
@Module({
  imports: [HttpModule],
  providers: [DataForwarderService],
  exports: [DataForwarderService],
})
export class DataForwarderModule {}

// ✅ GOOD: Global modules for shared services
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

// ✅ GOOD: Import order
@Module({
  imports: [
    // 1. Global config modules
    ConfigModule.forRoot({ ... }),
    
    // 2. Infrastructure modules
    PrismaModule,
    ConnectionManagerModule,
    
    // 3. Feature modules
    ProtocolsModule,
    TcpServerModule,
    ApiModule,
  ],
})
export class AppModule {}
```

### Import Path Aliases (tsconfig.json)

```typescript
// Configured aliases
"paths": {
  "@/*": ["src/*"],
  "@modules/*": ["src/modules/*"],
  "@config/*": ["src/config/*"],
  "@utils/*": ["src/utils/*"],
  "@common/*": ["src/common/*"]
}

// Usage examples
import { Logger } from '@utils/logger';
import { metrics } from '@utils/metrics';
import { SocketWithMeta } from '@/types/socket-meta';
import { DeviceService } from '@modules/device/device.service';
import configuration from '@config/configuration';
```

### Import Order Pattern

```typescript
// 1. Node.js built-ins
import * as net from 'net';
import { Socket } from 'net';

// 2. External packages (NestJS, third-party)
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// 3. Internal utilities (using aliases)
import { Logger } from '@utils/logger';
import { metrics } from '@utils/metrics';

// 4. Internal modules/services
import { DeviceService } from '../device/device.service';
import { ProtocolFactory } from '../protocols/protocol.factory';

// 5. Types/interfaces (last)
import { SocketWithMeta } from '@/types/socket-meta';
import { DecodedPacket, PacketType } from './decoder.interface';
```

---

## Error Handling Standards

### Try-Catch Pattern

**Standard structure for all async operations**:

```typescript
async methodName(param: Type): Promise<ReturnType | null> {
  try {
    // Business logic
    const result = await operation();
    
    // Log success
    this.logger.log('Operation successful', { context });
    
    // Update metrics
    metrics.successCounter.inc({ operation: 'methodName' });
    
    return result;
  } catch (error) {
    // Log error with stack trace
    this.logger.error(
      'Operation failed',
      (error as Error).stack,
      { param, additionalContext }
    );
    
    // Update error metrics
    metrics.errorCounter.inc({ 
      operation: 'methodName',
      error_type: error.name 
    });
    
    // Return null for recoverable errors
    return null;
    
    // OR throw for critical errors
    // throw error;
  }
}
```

### Error Handling Strategy

**Return `null` for**:
- Expected failures (device not found, validation failed)
- Recoverable errors (network timeout, temporary unavailability)
- Fire-and-forget operations

**Throw errors for**:
- Critical system failures (database connection lost)
- Configuration errors (missing required env vars)
- Unrecoverable state issues

**Examples**:
```typescript
// Return null pattern
async validateDevice(imei: string): Promise<Device | null> {
  try {
    const device = await this.deviceRepository.findByImei(imei);
    if (!device || !device.active) {
      this.logger.warn('Device not found or inactive', { imei });
      return null; // Expected case
    }
    return device;
  } catch (error) {
    this.logger.error('Database error', (error as Error).stack, { imei });
    return null; // Recoverable
  }
}

// Throw pattern
async initialize(): Promise<void> {
  const dbUrl = this.configService.get<string>('app.database.url');
  if (!dbUrl) {
    throw new Error('Database URL not configured'); // Critical
  }
  await this.$connect(); // Let connection errors propagate
}
```

### Fire-and-Forget Pattern

For non-blocking operations:
```typescript
// Method 1: No await
this.dataForwarder.forwardData(deviceData); // Fire and forget

// Method 2: Explicit async with catch
this.deviceRepository.updateLastConnect(imei).catch((error) => {
  this.logger.error('Failed to update', error.stack, { imei });
});
```

---

## Logging Standards

### Logger Initialization

**Always use custom Logger from `@utils/logger`** (not `@nestjs/common`):

```typescript
import { Logger } from '@utils/logger';

export class ServiceName {
  private logger = new Logger(ServiceName.name);
  // OR with custom context
  private logger = new Logger('CustomContext');
}
```

### Log Levels

| Level | Usage | Example |
|-------|-------|---------|
| `error` | Errors requiring attention | Database failures, critical bugs |
| `warn` | Recoverable issues | Device not found, validation failures |
| `log` | Important information | Server started, connection events |
| `debug` | Detailed runtime info | Packet parsing details, cache hits |
| `verbose` | Very detailed (rarely used) | Full buffer dumps |

### Log Message Format

**Use emojis for visual clarity**:
```typescript
this.logger.log('✅ TCP Server started on port 5023');
this.logger.error('❌ Failed to decode packet', error.stack);
this.logger.warn('⚠️ Device not found in database', { imei });
this.logger.debug('🔄 Processing GT06 location packet', { imei, lat, lng });
```

**Include context metadata**:
```typescript
// Good - includes context
this.logger.error(
  'Failed to forward data',
  (error as Error).stack,
  { imei, endpoint, statusCode }
);

// Bad - no context
this.logger.error('Error occurred', error.stack);
```

**Structured message format**:
```typescript
// Pattern: [Action] Details
logger.log(`TCP Server started on port ${port} for protocol ${protocol}`);
logger.debug(`New connection from ${connectionId} on port ${port}`);
logger.warn(`Device ${imei} not found in database`);
```

---

## Module Implementation Patterns

### Standard Module Structure

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FeatureService } from './feature.service';
import { FeatureController } from './feature.controller';
import { DependencyModule } from '../dependency/dependency.module';

@Module({
  imports: [
    ConfigModule,        // External modules first
    DependencyModule,    // Internal modules
  ],
  providers: [FeatureService],
  controllers: [FeatureController], // Optional
  exports: [FeatureService],        // Export for other modules
})
export class FeatureModule {}
```

### Service with Dependency Injection

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@utils/logger';
import { metrics } from '@utils/metrics';

@Injectable()
export class FeatureService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(FeatureService.name);

  constructor(
    private configService: ConfigService,
    private dependency1: Dependency1Service,
    private dependency2: Dependency2Service,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 FeatureService initializing...');
    // Initialization logic
  }

  async onModuleDestroy() {
    this.logger.log('🛑 FeatureService shutting down...');
    // Cleanup logic
  }

  async businessMethod(param: Type): Promise<Result | null> {
    try {
      // Implementation
      metrics.operationCounter.inc({ operation: 'businessMethod' });
      return result;
    } catch (error) {
      this.logger.error('Operation failed', (error as Error).stack, { param });
      return null;
    }
  }
}
```

### Repository Pattern

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@utils/logger';

@Injectable()
export class FeatureRepository extends PrismaClient implements OnModuleInit {
  private logger = new Logger(FeatureRepository.name);

  constructor(private configService: ConfigService) {
    super({
      datasources: {
        db: { url: configService.get('app.database.url') }
      },
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' }
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async findByImei(imei: string): Promise<Device | null> {
    const result = await this.$queryRaw<Device[]>`
      SELECT * FROM devices WHERE imei = ${imei} LIMIT 1
    `;
    return result[0] || null;
  }
}
```

**Important**: Prefer using shared `PrismaService` over extending `PrismaClient`:
```typescript
// Preferred approach
constructor(private prisma: PrismaService) {}

async findDevice(imei: string) {
  return this.prisma.device.findFirst({ where: { imei } });
}
```

### Controller Pattern

```typescript
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { Logger } from '@utils/logger';
import { FeatureService } from './feature.service';

@Controller('api/feature')
export class FeatureController {
  private logger = new Logger(FeatureController.name);

  constructor(private featureService: FeatureService) {}

  @Get(':id')
  async getById(@Param('id') id: string) {
    try {
      const result = await this.featureService.findById(id);
      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('GET /api/feature/:id failed', (error as Error).stack, { id });
      return {
        success: false,
        error: { message: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post()
  async create(@Body() createDto: CreateFeatureDto) {
    // Implementation
  }
}
```

---

## Protocol Decoder Implementation

### Base Decoder Interface

All protocol decoders must implement:

```typescript
export interface IProtocolDecoder {
  readonly protocolName: string;
  readonly requiresDeviceValidation: boolean;

  decode(buffer: Buffer, socket: Socket): DecodedPacket | null;
  generateAck(packet: DecodedPacket): Buffer | null;
  transformToDeviceData(packet: DecodedPacket): DeviceData | null;
  hasCompletePacket(buffer: Buffer): boolean;
  getPacketLength(buffer: Buffer): number;
}
```

### Abstract Base Decoder

Extend `BaseDecoder` for common utilities:

```typescript
import { BaseDecoder } from '../base/base-decoder.abstract';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CustomDecoder extends BaseDecoder {
  readonly protocolName = 'CUSTOM';
  readonly requiresDeviceValidation = true;

  decode(buffer: Buffer, socket: Socket): DecodedPacket | null {
    // 1. Check for complete packet
    if (!this.hasCompletePacket(buffer)) {
      return null;
    }

    // 2. Parse packet structure
    const messageType = buffer.readUInt8(offset);

    // 3. Validate checksum/CRC
    const calculatedCrc = this.calculateCrc16(buffer, start, end);
    if (expectedCrc !== calculatedCrc) {
      this.logger.error('CRC mismatch', undefined, {
        bufferHex: buffer.toString('hex')
      });
      return null;
    }

    // 4. Parse based on message type
    switch (messageType) {
      case 0x01: return this.decodeLogin(buffer, socket);
      case 0x02: return this.decodeLocation(buffer, socket);
      default: return this.decodeUnknown(buffer);
    }
  }

  generateAck(packet: DecodedPacket): Buffer | null {
    // Generate acknowledgment packet
    const ack = Buffer.alloc(size);
    // ... populate buffer
    return ack;
  }

  transformToDeviceData(packet: DecodedPacket): DeviceData | null {
    // Transform protocol-specific packet to common DeviceData format
    return {
      imei: packet.imei,
      latitude: packet.latitude,
      longitude: packet.longitude,
      timestamp: packet.timestamp,
      // ... other fields
    };
  }

  hasCompletePacket(buffer: Buffer): boolean {
    if (buffer.length < MIN_PACKET_SIZE) return false;
    const packetLength = this.getPacketLength(buffer);
    return buffer.length >= packetLength;
  }

  getPacketLength(buffer: Buffer): number {
    // Parse length field from buffer
    return buffer.readUInt16BE(offset);
  }

  // Private helper methods
  private decodeLogin(buffer: Buffer, socket: Socket): DecodedPacket {
    // Implementation
  }

  private decodeLocation(buffer: Buffer, socket: Socket): DecodedPacket {
    // Implementation
  }
}
```

### Protocol Processor Pattern

Create separate processor functions for orchestration:

```typescript
// process.custom.ts
import { Logger } from '@utils/logger';
import { metrics } from '@utils/metrics';

const logger = new Logger('ProcessCustom');

export async function processCustomPacket(
  packet: DecodedPacket,
  socket: Socket,
  decoder: IProtocolDecoder,
  deviceService: DeviceService,
  dataForwarder: DataForwarderService,
): Promise<void> {
  try {
    // 1. Validate device
    const device = await deviceService.validateDevice(packet.imei);
    if (!device) {
      logger.warn('Device validation failed', { imei: packet.imei });
      return;
    }

    // 2. Send acknowledgment
    const ack = decoder.generateAck(packet);
    if (ack) {
      socket.write(ack);
    }

    // 3. Transform to common format
    const deviceData = decoder.transformToDeviceData(packet);
    if (!deviceData) {
      logger.warn('Failed to transform packet', { imei: packet.imei });
      return;
    }

    // 4. Forward data (fire-and-forget)
    dataForwarder.forwardData(deviceData);

    // 5. Update metrics
    metrics.packetsProcessed.inc({ protocol: 'CUSTOM', type: packet.type });
    
  } catch (error) {
    logger.error('Processing failed', (error as Error).stack, { 
      imei: packet.imei 
    });
  }
}
```

### Register in Protocol Factory

```typescript
// protocol.factory.ts
@Injectable()
export class ProtocolFactory {
  private decoderMap: Map<number, IProtocolDecoder> = new Map();

  constructor(
    private configService: ConfigService,
    private customDecoder: CustomDecoder,
    // ... other decoders
  ) {
    this.initializeDecoders();
  }

  private initializeDecoders() {
    const customPort = this.configService.get<number>('app.ports.custom');
    if (customPort) {
      this.decoderMap.set(customPort, this.customDecoder);
      this.logger.log(`Registered CUSTOM decoder on port ${customPort}`);
    }
  }

  getDecoderByPort(port: number): IProtocolDecoder | null {
    return this.decoderMap.get(port) || null;
  }
}
```

---

## Database Patterns (Prisma)

### Schema Definition

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("PRIMARY_DATABASE_URL")
}

model Device {
  id          Int       @id @default(autoincrement())
  imei        String    @unique @db.VarChar(15)
  deviceName  String?   @db.VarChar(100)
  active      Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  lastConnect DateTime?

  @@index([imei])
  @@index([active])
  @@map("devices")
}
```

### Prisma Service (Global)

```typescript
// Use this pattern for shared database connection
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Logger } from '@utils/logger';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
```

### Query Patterns

```typescript
// Preferred: Type-safe Prisma queries
async findDevice(imei: string): Promise<Device | null> {
  return this.prisma.device.findUnique({
    where: { imei }
  });
}

// When needed: Raw SQL for complex queries
async findActiveByImei(imei: string): Promise<Device | null> {
  const result = await this.prisma.$queryRaw<Device[]>`
    SELECT * FROM devices 
    WHERE imei = ${imei} AND active = true 
    LIMIT 1
  `;
  return result[0] || null;
}

// Transactions
async updateWithHistory(imei: string, data: UpdateData) {
  return this.prisma.$transaction(async (tx) => {
    const device = await tx.device.update({
      where: { imei },
      data: { ...data, updatedAt: new Date() }
    });
    
    await tx.deviceHistory.create({
      data: { deviceId: device.id, changes: data }
    });
    
    return device;
  });
}
```

### Caching Pattern

```typescript
export class DeviceService {
  private deviceCache: Map<string, CacheEntry<Device>> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  async validateDevice(imei: string): Promise<Device | null> {
    // Check cache first
    const cached = this.deviceCache.get(imei);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug('Cache hit', { imei });
      return cached.data;
    }

    // Query database
    const device = await this.prisma.device.findFirst({
      where: { imei, active: true }
    });

    // Update cache
    this.deviceCache.set(imei, {
      data: device,
      timestamp: Date.now()
    });

    return device;
  }

  // Periodic cache cleanup
  private cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.deviceCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.deviceCache.delete(key);
      }
    }
  }
}
```

---

## Metrics and Monitoring

### Metrics Definition

All metrics are defined in `src/utils/metrics.ts`:

```typescript
import { Counter, Gauge, Histogram, register } from 'prom-client';

// Connection metrics
export const totalConnections = new Counter({
  name: 'gps_connections_total',
  help: 'Total number of device connections',
  labelNames: ['protocol', 'port'],
});

export const activeConnections = new Gauge({
  name: 'gps_connections_active',
  help: 'Number of active connections',
  labelNames: ['protocol', 'port'],
});

// Packet metrics
export const packetsReceived = new Counter({
  name: 'gps_packets_received_total',
  help: 'Total packets received',
  labelNames: ['protocol', 'packet_type'],
});

export const packetsProcessed = new Counter({
  name: 'gps_packets_processed_total',
  help: 'Total packets processed successfully',
  labelNames: ['protocol', 'type'],
});

// Error metrics
export const errorCounter = new Counter({
  name: 'gps_errors_total',
  help: 'Total errors encountered',
  labelNames: ['operation', 'error_type'],
});
```

### Usage in Services

```typescript
import { metrics } from '@utils/metrics';

export class TcpServerService {
  private handleConnection(socket: Socket, port: number) {
    // Update metrics
    metrics.totalConnections.inc({ protocol: 'GT06', port: port.toString() });
    metrics.activeConnections.inc({ protocol: 'GT06', port: port.toString() });
  }

  private handleData(buffer: Buffer, socket: SocketWithMeta) {
    metrics.packetsReceived.inc({ 
      protocol: socket.meta.protocol,
      packet_type: 'LOCATION' 
    });
  }

  private handleError(error: Error) {
    metrics.errorCounter.inc({ 
      operation: 'decode',
      error_type: error.name 
    });
  }
}
```

---

## Testing Patterns (Future Implementation)

### Unit Test Structure (Recommended)

```typescript
// feature.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FeatureService } from './feature.service';

describe('FeatureService', () => {
  let service: FeatureService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'app.ports.gt06': 5023,
                'app.database.url': 'mock-url',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FeatureService>(FeatureService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('businessMethod', () => {
    it('should process valid input', async () => {
      const result = await service.businessMethod('validInput');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle invalid input', async () => {
      const result = await service.businessMethod('invalidInput');
      expect(result).toBeNull();
    });
  });
});
```

---

## Common Utilities (`src/utils/`)

### Logger (`logger.ts`)

Custom Winston logger with daily rotation:

```typescript
import { Logger } from '@utils/logger';

// In any service
private logger = new Logger(ServiceName.name);

// Usage
this.logger.log('Info message', { metadata });
this.logger.debug('Debug message', { details });
this.logger.warn('Warning message', { context });
this.logger.error('Error message', errorStack, { context });
```

### Metrics (`metrics.ts`)

Prometheus metrics for monitoring:

```typescript
import { metrics } from '@utils/metrics';

metrics.totalConnections.inc({ protocol: 'GT06', port: '5023' });
metrics.activeConnections.set({ protocol: 'GT06' }, 150);
metrics.packetsReceived.inc({ protocol: 'GT06', type: 'LOCATION' });
```

### Common Helpers (`common.ts`)

Utility functions:

```typescript
import { delay, parseCoordinate, validateImei } from '@utils/common';

// Delay execution
await delay(1000); // 1 second

// Parse GPS coordinates
const latitude = parseCoordinate(rawValue, 'N');

// Validate IMEI
if (!validateImei(imei)) {
  throw new Error('Invalid IMEI');
}
```

### Command Executor (`executecommands.ts`)

Enterprise command execution utility:

```typescript
import { CommandExecutor } from '@utils/executecommands';

// Execute with logging
const result = await CommandExecutor.execute('npm run build', {
  cwd: '/project/path',
  timeout: 60000,
});

// Execute silently
const result = await CommandExecutor.executeSilent('git status');

// Background execution
CommandExecutor.executeBackground('npm start');

// Check command availability
const hasGit = await CommandExecutor.commandExists('git');
```

---

## Type Definitions (`src/types/`)

### Socket Metadata (`socket-meta.ts`)

```typescript
import { Socket } from 'net';

export interface SocketMeta {
  connectionId: string;
  protocol: string;
  port: number;
  imei?: string;
  buffer: Buffer;
  connectedAt: Date;
  lastActivity: Date;
}

export type SocketWithMeta = Socket & { meta?: SocketMeta };

// Usage
function handleConnection(socket: Socket, port: number) {
  const socketWithMeta = socket as SocketWithMeta;
  socketWithMeta.meta = {
    connectionId: generateId(),
    protocol: 'GT06',
    port,
    buffer: Buffer.alloc(0),
    connectedAt: new Date(),
    lastActivity: new Date(),
  };
}
```

---

## Lifecycle Management

### Graceful Shutdown

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class FeatureService implements OnModuleInit, OnModuleDestroy {
  private isShuttingDown = false;

  async onModuleInit() {
    this.logger.log('🚀 Service initializing...');
    await this.initialize();
  }

  async onModuleDestroy() {
    this.logger.log('🛑 Service shutting down...');
    this.isShuttingDown = true;
    await this.cleanup();
  }

  private async cleanup() {
    // Close connections
    await this.closeConnections();
    
    // Wait for pending operations
    while (this.hasPendingOperations()) {
      await this.delay(100);
    }
    
    this.logger.log('✅ Cleanup completed');
  }
}
```

---

## Key Design Principles

1. **Single Responsibility**: Each class/module has one clear purpose
2. **Dependency Injection**: Constructor-based DI, no direct instantiation
3. **Separation of Concerns**: Controller → Service → Repository layering
4. **Interface Segregation**: Small, focused interfaces
5. **Fail-Safe**: Return `null` on expected failures, throw on critical errors
6. **Observable**: Extensive logging and metrics at every layer
7. **Async by Default**: All I/O operations are async
8. **Resource Cleanup**: Implement `OnModuleDestroy` for proper cleanup
9. **Type Safety**: Always specify types, avoid `any`
10. **Error Context**: Always log errors with stack traces and context metadata

---

## Quick Checklist for New Code

When implementing new features, ensure:

- [ ] Uses correct file naming: `<feature>.<type>.ts`
- [ ] Class name follows conventions: `<Feature>Service/Controller/Module`
- [ ] Imports use path aliases: `@utils/*`, `@modules/*`, etc.
- [ ] Logger uses custom Logger: `import { Logger } from '@utils/logger'`
- [ ] All async methods have try-catch with proper error logging
- [ ] Errors include stack traces: `(error as Error).stack`
- [ ] Metrics are updated for operations: `metrics.operationCounter.inc()`
- [ ] Configuration access uses types: `configService.get<Type>('key')`
- [ ] Dependency injection via constructor (no `new` keyword for services)
- [ ] Implements lifecycle hooks if needed: `OnModuleInit`, `OnModuleDestroy`
- [ ] Returns `null` for expected failures, throws for critical errors
- [ ] Includes JSDoc comments for public methods
- [ ] Uses `PrismaService` for database access (not `new PrismaClient()`)
- [ ] Follows import order: built-ins → external → internal → types
- [ ] Constants use `UPPER_SNAKE_CASE`, methods use `camelCase`

---

## Critical Do's and Don'ts

### ✅ DO

- Use shared `PrismaService` for database access
- Use custom `Logger` from `@utils/logger`
- Include context in all log messages
- Update metrics for all operations
- Implement graceful shutdown (`OnModuleDestroy`)
- Type all variables and return types explicitly
- Use fire-and-forget for non-critical operations
- Cache frequently accessed data with TTL
- Validate configuration at startup (Joi schema)
- Use path aliases for imports

### ❌ DON'T

- Never instantiate `new PrismaClient()` directly
- Never use `Logger` from `@nestjs/common` (use custom logger)
- Never use `any` type (always specify proper types)
- Never block with `await` on fire-and-forget operations
- Never throw errors for expected failures (return `null` instead)
- Never log without context metadata
- Never use `&&` for chaining PowerShell commands (use `;`)
- Never create sub-shells unless explicitly needed
- Never leave commented-out code in production
- Never skip error handling in async operations

---

## Example: Complete Feature Implementation

### 1. Create Module

```typescript
// new-feature/new-feature.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NewFeatureService } from './new-feature.service';
import { NewFeatureController } from './new-feature.controller';
import { PrismaModule } from '../sqlconnection/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [NewFeatureService],
  controllers: [NewFeatureController],
  exports: [NewFeatureService],
})
export class NewFeatureModule {}
```

### 2. Create Service

```typescript
// new-feature/new-feature.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@utils/logger';
import { metrics } from '@utils/metrics';
import { PrismaService } from '../sqlconnection/prisma.service';

@Injectable()
export class NewFeatureService implements OnModuleInit {
  private logger = new Logger(NewFeatureService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.logger.log('🚀 NewFeatureService initialized');
  }

  async processData(input: string): Promise<Result | null> {
    try {
      this.logger.debug('Processing data', { input });
      
      // Business logic
      const result = await this.performOperation(input);
      
      // Update metrics
      metrics.operationCounter.inc({ operation: 'processData' });
      
      this.logger.log('Data processed successfully', { input });
      return result;
      
    } catch (error) {
      this.logger.error(
        'Failed to process data',
        (error as Error).stack,
        { input }
      );
      metrics.errorCounter.inc({ 
        operation: 'processData',
        error_type: error.name 
      });
      return null;
    }
  }

  private async performOperation(input: string): Promise<Result> {
    // Implementation
    return {} as Result;
  }
}
```

### 3. Create Controller (if needed)

```typescript
// new-feature/new-feature.controller.ts
import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { Logger } from '@utils/logger';
import { NewFeatureService } from './new-feature.service';

@Controller('api/new-feature')
export class NewFeatureController {
  private logger = new Logger(NewFeatureController.name);

  constructor(private newFeatureService: NewFeatureService) {}

  @Post('process')
  async process(@Body() body: { input: string }) {
    try {
      const result = await this.newFeatureService.processData(body.input);
      return {
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('POST /api/new-feature/process failed', (error as Error).stack);
      return {
        success: false,
        error: { message: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
```

### 4. Register in App Module

```typescript
// app.module.ts
import { NewFeatureModule } from './modules/new-feature/new-feature.module';

@Module({
  imports: [
    // ... existing modules
    NewFeatureModule,
  ],
})
export class AppModule {}
```

---

## Project Commands

```bash
# Development
npm run start:dev

# Production build
npm run build
npm run start:prod

# Database
npx prisma generate          # Generate Prisma client
npx prisma migrate dev       # Run migrations (dev)
npx prisma migrate deploy    # Run migrations (prod)
npx prisma studio           # Open Prisma Studio

# Linting
npm run lint
npm run format

# Testing (when implemented)
npm run test
npm run test:watch
npm run test:cov
```

---

## Additional Resources

- **NestJS Documentation**: https://docs.nestjs.com
- **Prisma Documentation**: https://www.prisma.io/docs
- **Fastify Documentation**: https://www.fastify.io
- **Prometheus Best Practices**: https://prometheus.io/docs/practices

---

## Notes for AI Assistants

When generating code for this project:

1. **Always follow the established patterns** in this document
2. **Check existing implementations** before creating new patterns
3. **Use the correct Logger** (`@utils/logger`, not `@nestjs/common`)
4. **Use shared PrismaService** (inject via constructor)
5. **Include comprehensive error handling** with logging and metrics
6. **Follow the naming conventions** strictly
7. **Add JSDoc comments** to all public methods
8. **Use path aliases** for imports
9. **Implement lifecycle hooks** when dealing with resources
10. **Return `null` for expected failures**, throw for critical errors

This project values **consistency**, **observability**, and **reliability**. When in doubt, examine existing implementations in similar modules and follow their patterns.
