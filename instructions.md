# NestJS GPS Tracker Project Instructions

## 🎯 Project Overview

This is a **production-ready NestJS TCP server** designed for handling 100K+ concurrent GPS device connections. It serves as a multi-protocol GPS tracker listener that receives, processes, and forwards GPS data from various tracking devices.

### Core Purpose
- **TCP Server**: Handle massive concurrent connections from GPS devices
- **Protocol Support**: GT06, Teltonika protocols with extensible architecture
- **Data Processing**: Real-time GPS data decoding and validation
- **Data Forwarding**: Async HTTP forwarding to external APIs
- **Device Management**: PostgreSQL-based device validation and management

---

## 🏗️ Project Architecture

### Technology Stack
- **Framework**: NestJS v10.3.0 with Fastify adapter (high performance)
- **Database**: PostgreSQL with Prisma ORM v5.7.1
- **Cache**: Redis v5.3.2 for connection state management
- **Monitoring**: Prometheus metrics + Winston logging
- **Container**: Docker + docker-compose for deployment
- **Language**: TypeScript with strict configuration

### Performance Targets
- **Concurrent Connections**: 100,000+
- **Connection Timeout**: 5 seconds
- **Socket Timeout**: 5 minutes
- **Keep-Alive**: 2 minutes
- **Max Connections Per Port**: 50,000

---

## 📁 Folder Structure & Responsibilities

```
src/
├── main.ts                     # Application bootstrap with Fastify
├── app.module.ts              # Root module with all imports
├── config/                    # Configuration management
│   ├── configuration.ts       # Centralized config with validation
│   └── validation.schema.ts   # Joi schema for env validation
├── modules/                   # Feature modules (domain-driven)
│   ├── api/                  # REST API endpoints
│   │   ├── api.controller.ts # Health, metrics, device endpoints
│   │   └── api.module.ts     # API module configuration
│   ├── connection-manager/   # Connection lifecycle management
│   │   ├── connection-manager.service.ts  # Redis-based connection tracking
│   │   ├── interfaces/
│   │   │   └── connection.interface.ts    # Connection type definitions
│   │   └── connection-manager.module.ts
│   ├── data-forwarder/       # External API data forwarding
│   │   ├── data-forwarder.service.ts      # HTTP forwarding logic
│   │   └── data-forwarder.module.ts
│   ├── device/               # Device management & validation
│   │   ├── device.controller.ts           # Device CRUD operations
│   │   ├── device.service.ts              # Business logic
│   │   ├── device.repository.ts           # Data access layer
│   │   └── device.module.ts
│   ├── protocols/            # GPS protocol decoders
│   │   ├── protocol.factory.ts            # Protocol detection & factory
│   │   ├── base/             # Abstract base classes
│   │   │   ├── base-decoder.abstract.ts   # Common decoder functionality
│   │   │   └── decoder.interface.ts       # Protocol contracts
│   │   ├── gt06/             # GT06 protocol implementation
│   │   │   ├── gt06.decoder.ts            # GT06 packet decoder
│   │   │   └── gt06.types.ts              # GT06 type definitions
│   │   ├── teltonika/        # Teltonika protocol implementation
│   │   │   ├── teltonika.decoder.ts       # Teltonika packet decoder
│   │   │   └── teltonika.types.ts         # Teltonika type definitions
│   │   └── protocols.module.ts
│   └── tcp-server/           # TCP server implementation
│       ├── tcp-server.service.ts          # Socket handling & lifecycle
│       └── tcp-server.module.ts
└── utils/                    # Shared utilities
    ├── logger.ts             # Winston logger configuration
    └── metrics.ts            # Prometheus metrics setup
```

---

## 🏛️ Architecture Patterns & Best Practices

### 1. **Module Structure (Domain-Driven Design)**
- Each feature is a **self-contained module**
- **Clear separation** of concerns (Controller → Service → Repository)
- **Dependency injection** for testability and flexibility
- **Interface-driven** development for protocol extensibility

### 2. **Protocol Design Pattern**
```typescript
// Abstract base for all protocol decoders
abstract class BaseDecoder {
  abstract protocolName: string;
  abstract decode(buffer: Buffer): DecodedPacket[];
  abstract hasCompletePacket(buffer: Buffer): boolean;
}

// Factory pattern for protocol detection
class ProtocolFactory {
  static detectProtocol(buffer: Buffer): BaseDecoder | null;
}
```

### 3. **Connection Management Pattern**
```typescript
// Redis-based connection tracking with TTL
interface ConnectionInfo {
  deviceId: string;
  protocol: string;
  lastSeen: Date;
  ip: string;
  port: number;
}
```

### 4. **Async Data Processing**
```typescript
// Fire-and-forget pattern for external forwarding
@Injectable()
export class DataForwarderService {
  // Non-blocking HTTP forwarding
  async forwardData(data: DeviceData): Promise<void> {
    // Process without waiting for response
  }
}
```

---

## 📋 Coding Standards & Guidelines

### 1. **File Naming Conventions**
- **Services**: `*.service.ts` (business logic)
- **Controllers**: `*.controller.ts` (HTTP endpoints)
- **Modules**: `*.module.ts` (feature containers)
- **Interfaces**: `*.interface.ts` (type contracts)
- **Types**: `*.types.ts` (protocol-specific types)
- **Repositories**: `*.repository.ts` (data access)

### 2. **Class & Method Naming**
```typescript
// Use descriptive, action-oriented names
export class GT06Decoder extends BaseDecoder {
  // Method names should be verbs
  public decodeLocationPacket(buffer: Buffer): LocationData {}
  public parseDeviceIdentifier(buffer: Buffer): string {}
  
  // Private methods with underscore prefix
  private _validateChecksum(buffer: Buffer): boolean {}
}
```

### 3. **Error Handling Standards**
```typescript
// Use structured error handling
try {
  const result = await this.processPacket(buffer);
  return result;
} catch (error) {
  this.logger.error(`Failed to process packet`, {
    error: error.message,
    protocol: this.protocolName,
    bufferLength: buffer.length,
  });
  throw new InternalServerErrorException('Packet processing failed');
}
```

### 4. **Logging Standards**
```typescript
// Use structured logging with context
this.logger.log('Device connected', {
  deviceId: device.imei,
  protocol: 'GT06',
  ip: socket.remoteAddress,
  connectionCount: this.connectionCount,
});
```

### 5. **Configuration Management**
```typescript
// Use typed configuration with validation
export interface AppConfig {
  ports: {
    gt06: number;
    teltonika: number;
  };
  database: {
    url: string;
    poolSize: number;
  };
}
```

---

## 🔧 Development Workflow

### 1. **Adding a New Protocol**
```bash
# Create protocol directory
mkdir src/modules/protocols/new-protocol/

# Required files:
# - new-protocol.decoder.ts (extends BaseDecoder)
# - new-protocol.types.ts (protocol-specific interfaces)

# Update protocol factory
# Add to protocols.module.ts
```

### 2. **Database Schema Changes**
```bash
# 1. Update Prisma schema
vim prisma/schema.prisma

# 2. Generate Prisma client
npm run prisma:generate

# 3. Apply changes (if needed)
# Note: This project uses existing database
```

### 3. **Testing Strategy**
```typescript
// Unit tests for decoders
describe('GT06Decoder', () => {
  it('should decode location packet correctly', () => {
    const buffer = Buffer.from('...'); // Test data
    const result = decoder.decode(buffer);
    expect(result).toMatchObject({
      type: PacketType.LOCATION,
      deviceId: 'expected-imei',
    });
  });
});
```

### 4. **Performance Optimization Guidelines**
```typescript
// 1. Use Buffer operations efficiently
const imei = buffer.toString('hex', 4, 12); // Direct slice

// 2. Avoid unnecessary object creation
const reusableConfig = { timeout: 5000 }; // Declare once

// 3. Use async/await properly
await Promise.all([task1, task2, task3]); // Parallel execution
```

---

## 🌐 Environment Configuration

### Required Environment Variables
```env
# Database (PostgreSQL)
PRIMARY_DATABASE_URL="postgresql://user:pass@host:port/db"

# TCP Server Ports
GT06_PORT=5023                    # GT06 protocol port
TELTONIKA_PORT=5024              # Teltonika protocol port

# API Configuration
API_PORT=5055                    # REST API port

# Connection Settings
CON_TIME_OUT=5000               # Connection timeout (ms)
SOCKET_TIMEOUT=300000           # Socket timeout (ms)  
KEEP_ALIVE_TIMEOUT=120000       # Keep-alive timeout (ms)
MAX_CONNECTIONS_PER_PORT=50000  # Max connections per port

# Security
SECRET_KEY="your-secret-key"    # Application secret

# Data Forwarding
DATA_FORWARD="https://your-api.com/webhook/gpsdata"

# Redis (Optional - defaults to localhost)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Logging
LOG_LEVEL=info                  # debug, info, warn, error
NODE_ENV=production             # development, production
```

---

## 🚀 Deployment & Operations

### 1. **Development Setup**
```bash
# Install dependencies
npm install

# Start in development mode
npm run start:dev

# Run tests
npm run test
```

### 2. **Production Deployment**
```bash
# Build application
npm run build

# Start production server
npm run start:prod

# Using Docker
docker-compose up -d
```

### 3. **Monitoring Endpoints**
- **Health Check**: `GET /api/health`
- **Metrics**: `GET /api/metrics` (Prometheus format)
- **Device Status**: `GET /api/devices/:imei`

### 4. **Performance Monitoring**
```typescript
// Key metrics to monitor:
// - tcp_connections_active (active connections)
// - packets_processed_total (processed packets)
// - packets_errors_total (error count)
// - data_forwarding_duration (forwarding latency)
```

---

## 🔍 Protocol Implementation Guide

### Adding a New Protocol Decoder

1. **Create Protocol Directory**
   ```
   src/modules/protocols/your-protocol/
   ├── your-protocol.decoder.ts
   ├── your-protocol.types.ts
   └── __tests__/
   ```

2. **Implement Base Decoder**
   ```typescript
   @Injectable()
   export class YourProtocolDecoder extends BaseDecoder {
     readonly protocolName = 'YourProtocol';
     readonly requiresDeviceValidation = true; // or false
     
     public hasCompletePacket(buffer: Buffer): boolean {
       // Implement packet boundary detection
     }
     
     public decode(buffer: Buffer, socket: Socket): DecodedPacket[] {
       // Implement packet parsing logic
     }
   }
   ```

3. **Define Protocol Types**
   ```typescript
   export interface YourProtocolPacket {
     messageType: YourProtocolMessageType;
     deviceId: string;
     timestamp: Date;
     // ... protocol-specific fields
   }
   ```

4. **Update Protocol Factory**
   ```typescript
   // Add detection logic to protocol.factory.ts
   public static detectProtocol(buffer: Buffer): BaseDecoder | null {
     if (this.isYourProtocol(buffer)) {
       return this.injector.get(YourProtocolDecoder);
     }
     // ... existing protocols
   }
   ```

---

## 📝 Code Review Checklist

### Before Submitting Code
- [ ] **Error Handling**: All async operations wrapped in try-catch
- [ ] **Logging**: Structured logging with appropriate levels
- [ ] **Types**: Full TypeScript typing, no `any` usage
- [ ] **Performance**: Buffer operations optimized, no unnecessary allocations
- [ ] **Testing**: Unit tests for new decoders/services
- [ ] **Documentation**: JSDoc comments for public methods
- [ ] **Configuration**: New env vars documented and validated
- [ ] **Memory Management**: No memory leaks in connection handling
- [ ] **Protocol Validation**: Input validation for all packet parsing
- [ ] **Backwards Compatibility**: Database schema changes are additive

### Security Considerations
- [ ] **Input Validation**: All external data validated
- [ ] **SQL Injection**: Use Prisma query builders, no raw SQL
- [ ] **DoS Protection**: Connection limits and timeouts implemented
- [ ] **Secrets Management**: No hardcoded secrets in code
- [ ] **Error Messages**: Don't expose internal details in responses

---

## 🔧 Debugging & Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Check for buffer accumulation in TCP connections
   - Verify Redis TTL settings for connection cleanup
   - Monitor connection count vs. limits

2. **Packet Parsing Errors**
   - Enable debug logging: `LOG_LEVEL=debug`
   - Use test utilities: `debug-packet.js`, `test-*.js`
   - Verify protocol detection logic

3. **Database Connection Issues**
   - Check `PRIMARY_DATABASE_URL` format
   - Verify Prisma client generation
   - Monitor connection pool usage

### Debug Tools
```bash
# Debug specific packet format
node debug-packet.js

# Test GT06 protocol
node test-gt06-packet.js

# Test location parsing
node test-location-parsing.js

# IMEI parsing test
node test-imei-fix.js
```

---

## 📚 Additional Resources

### Key Dependencies Documentation
- [NestJS Documentation](https://docs.nestjs.com/)
- [Fastify Adapter](https://docs.nestjs.com/techniques/performance)
- [Prisma ORM](https://www.prisma.io/docs/)
- [Winston Logger](https://github.com/winstonjs/winston)
- [Prometheus Metrics](https://prometheus.io/docs/)

### Protocol Documentation
- **GT06**: See `TRACCAR_COMPARISON.md` for protocol details
- **Teltonika**: Industry-standard GPS tracking protocol

---

This document serves as the **complete context** for AI assistance and development work. When requesting code changes or new features, refer to these guidelines to maintain consistency with the project architecture and coding standards.