# AI Coding Reference - NestJS GPS Tracking System

## Project Overview

This is a **NestJS Framework** project for GPS tracking systems that handles multiple device protocols (GT06, Teltonika) via TCP connections, processes location data, and forwards it to external APIs. Built with TypeScript, Fastify, Prisma, Redis, and enterprise-grade patterns.

---

## Technology Stack

- **Framework**: NestJS v10.3.0 (TypeScript)
- **HTTP Adapter**: Fastify (high performance, 100K+ concurrent connections)
- **Database**: PostgreSQL with Prisma ORM v5.7.1
- **Cache Layer**: Redis v5.3.2 (ioredis client)
- **Monitoring**: Prometheus metrics (prom-client)
- **Logging**: Winston with daily file rotation
- **Validation**: class-validator, class-transformer, Joi
- **HTTP Client**: Axios via @nestjs/axios

---

## Project Structure

```
e:\2026\Listner-Nest/
├── prisma/
│   ├── schema.prisma              # Database schema definition
│   └── migrations/                # Database migrations
├── src/
│   ├── main.ts                    # Application entry point
│   ├── app.module.ts              # Root module
│   ├── config/
│   │   ├── configuration.ts       # Environment configuration (registerAs pattern)
│   │   └── validation.schema.ts   # Joi validation schema for env variables
│   ├── types/
│   │   └── socket-meta.ts         # Custom type definitions (SocketWithMeta, etc.)
│   ├── utils/
│   │   ├── logger.ts              # Custom Winston logger
│   │   ├── metrics.ts             # Prometheus metrics definitions
│   │   ├── redisstart.ts          # Redis initialization utility
│   │   ├── common.ts              # Common helper functions
│   │   ├── executecommands.ts     # Command execution utility
│   │   └── identifyos.ts          # OS identification utility
│   └── modules/
│       ├── connection-manager/    # Redis connection management
│       │   ├── connection-manager.module.ts
│       │   ├── connection-manager.service.ts
│       │   └── interfaces/
│       │       └── connection.interface.ts
│       ├── sqlconnection/         # Prisma PostgreSQL connection
│       │   ├── prisma.module.ts   # @Global() module
│       │   └── prisma.service.ts  # PrismaClient wrapper
│       ├── common/                # Common business functions
│       │   ├── common.module.ts
│       │   └── common.service.ts
│       ├── data-forwarder/        # HTTP POST API data forwarding
│       │   ├── data-forwarder.module.ts
│       │   └── data-forwarder.service.ts
│       ├── protocols/             # Protocol handling (factory pattern)
│       │   ├── protocol.factory.ts       # Port-to-service mapping
│       │   ├── protocols.module.ts
│       │   ├── base/
│       │   │   ├── decoder.interface.ts  # IProtocolDecoder interface
│       │   │   └── base-decoder.abstract.ts  # Abstract base class
│       │   ├── gt06/              # GT06 protocol implementation
│       │   │   ├── gt06.service.ts       # Complete protocol service (decode/encode/process)
│       │   │   └── gt06.types.ts         # Protocol-specific types
│       │   └── teltonika/         # Teltonika protocol implementation
│       │       ├── teltonika.service.ts  # Complete protocol service (decode/encode/process)
│       │       └── teltonika.types.ts
│       ├── device/                # Device management
│       │   ├── device.module.ts
│       │   ├── device.service.ts
│       │   ├── device.controller.ts
│       │   └── device.repository.ts      # Prisma repository pattern
│       ├── tcp-server/            # TCP server for device connections
│       │   ├── tcp-server.module.ts
│       │   └── tcp-server.service.ts
│       ├── autosync/              # Background sync jobs
│       │   ├── autosync.module.ts
│       │   └── autosync.service.ts
│       └── api/                   # REST API endpoints
│           ├── api.module.ts
│           └── api.controller.ts
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── nest-cli.json
```

---

## Module Descriptions

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
- **Purpose**: Device validation, CRUD operations, status tracking
- **Key Files**: `device.service.ts`, `device.repository.ts`, `device.controller.ts`
- **Pattern**: Controller → Service → Repository layering
- **Features**: In-memory caching (5min TTL), raw SQL queries via Prisma

#### 5. **`/protocols`** - Protocol Processing (Service-Based Architecture)
- **Purpose**: Complete protocol handling via dedicated services for each protocol
- **Key Components**:
  - **`protocol.factory.ts`**: Maps port numbers to protocol service instances
  - **`base/decoder.interface.ts`**: Common interface (`IProtocolDecoder`)
  - **`base/base-decoder.abstract.ts`**: Shared utility methods (CRC, coordinate parsing)
  - **`gt06/gt06.service.ts`**: Complete GT06 service (decode, encode, ACK, transform, process)
  - **`teltonika/teltonika.service.ts`**: Complete Teltonika service (decode, encode, ACK, transform, process)

**Protocol Service Pattern** (All-in-One Approach):
Each protocol service extends `BaseDecoder` and implements:
```typescript
@Injectable()
export class GT06Service extends BaseDecoder {
  readonly protocolName = 'GT06';
  
  // Decoder methods
  decode(buffer: Buffer, socket: Socket): DecodedPacket | null { }
  generateAck(packet: DecodedPacket): Buffer | null { }
  transformToDeviceData(packet: DecodedPacket): DeviceData | null { }
  hasCompletePacket(buffer: Buffer): boolean { }
  getPacketLength(buffer: Buffer): number { }
  
  // Encoder methods
  encodeCommand(command: string, serialNumber?: number): Buffer | null { }
  sendCommand(socket: Socket, command: string): Promise<boolean> { }
  
  // Processing orchestration
  async processData(socket: SocketWithMeta, parsedData: any, port: number): Promise<void> { }
}
```

**Benefits of Service-Based Architecture**:
- ✅ Single Responsibility: Each service handles one protocol completely
- ✅ Encapsulation: All protocol logic (decode/encode/process) in one place
- ✅ Maintainability: Easy to add new protocols by creating new service
- ✅ Clean Code: No separate decoder, encoder, and process files
- ✅ Type Safety: Full TypeScript with proper interfaces

#### 6. **`/data-forwarder`** - HTTP Data Forwarding
- **Purpose**: Sends processed GPS data to external APIs via HTTP POST
- **Key Files**: `data-forwarder.service.ts`
- **Pattern**: Fire-and-forget (no await), retry logic, error handling
- **Features**: Configurable endpoints, timeout handling

#### 7. **`/common`** - Common Business Functions
- **Purpose**: Shared business logic utilities
- **Key Files**: `common.service.ts`
- **Usage**: Helper methods used across multiple modules

#### 8. **`/autosync`** - Background Synchronization
- **Purpose**: Scheduled tasks for device sync, cleanup
- **Key Files**: `autosync.service.ts`
- **Pattern**: Uses `@nestjs/schedule`, implements graceful shutdown

#### 9. **`/api`** - REST API Endpoints
- **Purpose**: Exposes HTTP REST API for external clients
- **Key Files**: `api.controller.ts`
- **Features**: Device queries, status checks, health endpoints

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
  PRIMARY_DATABASE_URL: Joi.string().required(),
  GT06_PORT: Joi.number().default(5023),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
});
```

---

## Coding Standards

### File Naming Conventions

| Type | Pattern | Examples |
|------|---------|----------|
| Module | `<feature>.module.ts` | `device.module.ts`, `tcp-server.module.ts` |
| Service | `<feature>.service.ts` | `device.service.ts`, `data-forwarder.service.ts` |
| Controller | `<feature>.controller.ts` | `device.controller.ts`, `api.controller.ts` |
| Repository | `<feature>.repository.ts` | `device.repository.ts` |
| Interface | `<feature>.interface.ts` | `connection.interface.ts`, `decoder.interface.ts` |
| Types | `<feature>.types.ts` | `gt06.types.ts`, `teltonika.types.ts` |
| Abstract | `<feature>.abstract.ts` | `base-decoder.abstract.ts` |
| Utility | `<utility>.ts` | `logger.ts`, `metrics.ts`, `common.ts` |
| Config | `<config>.ts` | `configuration.ts`, `validation.schema.ts` |
| Processor | `process.<protocol>.ts` | `process.gt06.ts`, `process.teltonika.ts` |

### Class Naming Conventions

```typescript
// Services
export class DeviceService { }
export class TcpServerService { }

// Controllers
export class DeviceController { }
export class ApiController { }

// Modules
export class DeviceModule { }
export class ProtocolsModule { }

// Repositories
export class DeviceRepository { }

// Decoders
export class GT06Decoder { }
export class TeltonikaDecoder { }

// Factories
export class ProtocolFactory { }

// Interfaces (with I prefix or descriptive)
export interface IProtocolDecoder { }
export interface ConnectionInfo { }

// Enums
export enum PacketType { }
export enum GT06MessageType { }

// Types
export type SocketWithMeta = Socket & { meta?: SocketMeta };
```

### Variable & Method Naming

**camelCase for variables and methods**:
```typescript
// Private fields
private deviceCache: Map<string, Device>;
private isShuttingDown: boolean;

// Public methods
async validateDevice(imei: string): Promise<Device | null> { }
async forwardData(data: DeviceData): Promise<void> { }

// Private methods
private handleConnection(socket: Socket): void { }
private parseBuffer(buffer: Buffer): DecodedPacket | null { }

// Boolean methods
isConnected(): boolean { }
hasCompletePacket(buffer: Buffer): boolean { }

// Getters
getDecoderByPort(port: number): IProtocolDecoder | null { }
getActiveDevices(): Set<string> { }
```

**UPPER_SNAKE_CASE for constants**:
```typescript
private static readonly DEFAULT_TIMEOUT = 30000;
private static readonly MAX_BUFFER_SIZE = 8192;
private readonly CACHE_TTL = 300000; // 5 minutes
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
