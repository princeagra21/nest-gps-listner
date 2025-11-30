# Quick Start Guide

Get your GPS tracking server running in minutes!

## Option 1: Docker Compose (Recommended)

The fastest way to get everything running:

```bash
# Start all services (PostgreSQL, Redis, Application)
docker-compose up -d

# View logs
docker-compose logs -f app

# Check health
curl http://localhost:5055/api/health
```

That's it! Your server is now running on:
- TCP GT06: `localhost:5023`
- TCP Teltonika: `localhost:5024`
- HTTP API: `http://localhost:5055`

## Option 2: Local Development

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Infrastructure

Make sure PostgreSQL and Redis are running locally, or start them with Docker:

```bash
# PostgreSQL
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=Stack@321 \
  -e POSTGRES_DB=FleetStack_db \
  -p 5432:5432 \
  postgres:15-alpine

# Redis
docker run -d --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

### 3. Setup Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### 4. Start Application

```bash
# Development mode with hot-reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## Testing the Server

### 1. Check Health

```bash
curl http://localhost:5055/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

### 2. View Statistics

```bash
curl http://localhost:5055/api/stats
```

### 3. View Metrics

```bash
curl http://localhost:5055/api/metrics
```

### 4. Check Active Connections

```bash
curl http://localhost:5055/api/connections
```

## Adding Test Devices

### Via Prisma Studio

```bash
npm run prisma:studio
```

Navigate to `http://localhost:5555` and add devices to the `devices` table:

```
imei: 123456789012345
protocol: GT06
active: true
```

### Via SQL

```bash
# Connect to PostgreSQL
docker exec -it postgres psql -U postgres -d FleetStack_db

# Insert test device
INSERT INTO devices (imei, protocol, active, name) 
VALUES ('123456789012345', 'GT06', true, 'Test Device 1');
```

## Simulating GPS Devices

You can use tools like:
- **GPSGate Simulator** - For GT06 protocol
- **AVL Tester** - For Teltonika protocol
- **Custom scripts** - Using TCP socket libraries

Example Python script to connect:

```python
import socket

# Connect to GT06 port
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(('localhost', 5023))

# Send login packet (example - adjust for your protocol)
# ... send your protocol-specific packets

sock.close()
```

## Monitoring

### Check Logs

```bash
# Docker
docker-compose logs -f app

# Local
tail -f logs/application-*.log
```

### View Metrics

Access Prometheus metrics at:
```
http://localhost:5055/api/metrics
```

Import into Prometheus or Grafana for visualization.

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :5023  # On macOS/Linux
netstat -ano | findstr :5023  # On Windows

# Kill process or change port in .env
```

### Database Connection Error

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check connection string in .env
PRIMARY_DATABASE_URL="postgresql://postgres:Stack@321@localhost:5432/FleetStack_db?schema=public"
```

### Redis Connection Error

```bash
# Check Redis is running
docker ps | grep redis

# Test Redis connection
redis-cli ping
```

### Device Not Connecting

1. Check device IMEI is in database
2. Verify device protocol matches port
3. Check firewall rules
4. Enable debug logs: `LOG_LEVEL=debug` in .env
5. Monitor logs for connection attempts

## Next Steps

- 📖 Read the full [README.md](README.md)
- 🔧 Customize `.env` configuration
- 📊 Set up monitoring dashboards
- 🚀 Deploy to production
- 🧪 Run load tests

## Support

For issues:
1. Check logs first
2. Verify configuration
3. Review documentation
4. Contact development team
