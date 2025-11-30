# Listner-Nest GPS Tracker Server

A production-ready, high-performance NestJS application for handling 100K+ concurrent GPS device connections via TCP servers. Supports multiple GPS protocols including GT06 and Teltonika with real-time data forwarding.

## 🚀 Features

- **Multi-Protocol Support**: GT06, Teltonika (easily extensible for more protocols)
- **High Performance**: Built with Fastify adapter, optimized for 100K+ concurrent connections
- **Redis Caching**: Connection state management with TTL
- **PostgreSQL Database**: Device validation and management with Prisma ORM
- **Async Data Forwarding**: Fire-and-forget HTTP forwarding without blocking
- **Prometheus Metrics**: Built-in metrics for monitoring
- **Structured Logging**: Winston-based logging with daily rotation
- **Health Checks**: API endpoints for monitoring
- **Docker Support**: Complete containerization with docker-compose
- **Production Ready**: Graceful shutdown, error handling, and best practices

## 📋 Prerequisites

- Node.js 20+
- PostgreSQL 12+
- Redis 6+
- npm or yarn

## 🛠️ Installation

### 1. Clone and Install Dependencies

```bash
cd E:\2026\Listner-Nest
npm install
```

### 2. Configure Environment

The `.env` file is already configured with:

```env
PRIMARY_DATABASE_URL="postgresql://postgres:Stack@321@localhost:5432/FleetStack_db?schema=public"
GT06_PORT=5023
TELTONIKA_PORT=5024
CON_TIME_OUT=5000
SECRET_KEY="123456"
DATA_FORWARD="https://agent.fleetstack.in/webhook/gpsdata"
API_PORT=5055
```

### 3. Database Setup

**IMPORTANT**: This application is configured for use with your **existing database**.

```bash
# Generate Prisma client (required)
npm run prisma:generate

# Optional: Pull your existing schema for IDE support
npm run prisma:pull

# Optional: Open Prisma Studio to browse your data
npm run prisma:studio
```

📖 **See [SETUP_EXISTING_DB.md](SETUP_EXISTING_DB.md) for detailed instructions on using your existing database schema.**

### 4. Start Services

#### Development Mode:

```bash
npm run start:dev
```

#### Production Mode:

```bash
npm run build
npm run start:prod
```

#### Using Docker Compose:

```bash
docker-compose up -d
```

## 🐳 Docker Deployment

### Build and Run with Docker Compose

```bash
# Start all services (PostgreSQL, Redis, App)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Production Deployment

```bash
# Build image
docker build -t listner-nest:latest .

# Run container
docker run -d \
  --name listner-nest \
  -p 5023:5023 \
  -p 5024:5024 \
  -p 5055:5055 \
  --env-file .env \
  listner-nest:latest
```

## 📡 API Endpoints

### Health & Monitoring

- **GET** `/api/health` - Health check endpoint
- **GET** `/api/stats` - Server statistics (connections, memory, cache)
- **GET** `/api/metrics` - Prometheus metrics
- **GET** `/api/info` - Application information
- **GET** `/api/connections` - Active device connections

### Device Management

- **GET** `/api/devices` - Get all active devices
- **GET** `/api/devices/:imei` - Get device by IMEI with connection status
- **DELETE** `/api/devices/:imei/cache` - Clear device cache
- **DELETE** `/api/devices/cache` - Clear all device cache

## 🔌 TCP Server Ports

- **Port 5023**: GT06 Protocol
- **Port 5024**: Teltonika Protocol
- **Port 5055**: HTTP API

## 📊 Architecture

```
src/
├── config/                  # Configuration and validation
├── modules/
│   ├── protocols/          # Protocol decoders
│   │   ├── base/           # Abstract base decoder
│   │   ├── gt06/           # GT06 protocol implementation
│   │   └── teltonika/      # Teltonika protocol implementation
│   ├── tcp-server/         # TCP server management
│   ├── connection-manager/ # Redis-based connection cache
│   ├── device/             # Device validation & repository
│   ├── data-forwarder/     # Async HTTP data forwarding
│   └── api/                # REST API controllers
└── utils/                  # Logger and metrics utilities
```

## 🔧 Configuration

### Environment Variables

| Variable                | Description                        | Default     |
|------------------------|------------------------------------|-------------|
| `PRIMARY_DATABASE_URL`  | PostgreSQL connection string       | Required    |
| `GT06_PORT`            | GT06 protocol TCP port             | 5023        |
| `TELTONIKA_PORT`       | Teltonika protocol TCP port        | 5024        |
| `API_PORT`             | HTTP API port                      | 5055        |
| `CON_TIME_OUT`         | Connection timeout (ms)            | 5000        |
| `SOCKET_TIMEOUT`       | Socket timeout (ms)                | 300000      |
| `KEEP_ALIVE_TIMEOUT`   | Keep-alive timeout (ms)            | 120000      |
| `SECRET_KEY`           | Application secret key             | Required    |
| `DATA_FORWARD`         | External webhook URL               | Required    |
| `REDIS_HOST`           | Redis server host                  | localhost   |
| `REDIS_PORT`           | Redis server port                  | 6379        |
| `DB_POOL_SIZE`         | Database connection pool size      | 50          |
| `MAX_CONNECTIONS_PER_PORT` | Max TCP connections per port   | 50000       |
| `NODE_ENV`             | Environment (development/production)| development |
| `LOG_LEVEL`            | Logging level                      | info        |

## 📈 Performance Optimization

### Database
- Connection pooling (50 connections by default)
- Prepared statement caching
- Device validation caching (5-minute TTL)

### TCP Server
- Keep-alive enabled
- TCP_NODELAY for low latency
- Socket timeout management
- Graceful connection handling

### Redis
- Connection state caching
- 1-hour TTL for connections
- Automatic cleanup

### Data Forwarding
- Fire-and-forget pattern
- Non-blocking async HTTP
- 5-second timeout
- Optional retry mechanism

## 🔍 Monitoring

### Prometheus Metrics

Access metrics at `http://localhost:5055/api/metrics`:

- `tcp_active_connections` - Active TCP connections by protocol
- `tcp_total_connections` - Total connections established
- `packets_received_total` - Total packets received
- `packets_decoded_total` - Successfully decoded packets
- `packet_processing_duration_seconds` - Packet processing latency
- `device_validations_total` - Device validation attempts
- `data_forward_success_total` - Successful data forwards
- `data_forward_failure_total` - Failed data forwards

### Logs

Logs are stored in `logs/` directory:
- `application-YYYY-MM-DD.log` - Application logs
- `error-YYYY-MM-DD.log` - Error logs

## 🧪 Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 🚦 Data Flow

1. **Device connects** → TCP server identifies protocol by port
2. **Login packet** → Extract IMEI, validate device in database
3. **Cache connection** → Store in Redis with metadata
4. **Data packets** → Decode, validate, transform
5. **Forward data** → Async POST to webhook (fire-and-forget)
6. **Send ACK** → Protocol-specific acknowledgment to device

## 🔐 Security

- Non-root Docker user
- Environment-based secrets
- Input validation with class-validator
- CORS configuration
- Connection timeouts
- Rate limiting ready (add middleware as needed)

## 📝 Adding New Protocols

1. Create decoder in `src/modules/protocols/[protocol-name]/`
2. Extend `BaseDecoder` abstract class
3. Implement required methods: `decode()`, `generateAck()`, etc.
4. Register in `ProtocolFactory`
5. Add port configuration to `.env`

## 🤝 Contributing

1. Follow existing code structure
2. Maintain TypeScript strict mode
3. Add tests for new features
4. Update documentation

## 📄 License

MIT

## 👥 Support

For issues and questions, please contact the development team.

## 🎯 Production Checklist

- [ ] Update SECRET_KEY to strong random value
- [ ] Configure proper DATABASE_URL with production credentials
- [ ] Set up Redis with password authentication
- [ ] Configure reverse proxy (nginx) for API
- [ ] Set up SSL/TLS certificates
- [ ] Configure firewall rules for TCP ports
- [ ] Set up log aggregation (ELK, Grafana Loki)
- [ ] Configure Prometheus scraping
- [ ] Set up alerting rules
- [ ] Configure backup strategy for PostgreSQL
- [ ] Test with load testing tools (10K+ devices)
- [ ] Configure auto-scaling if using container orchestration
- [ ] Set up monitoring dashboards
- [ ] Document incident response procedures
