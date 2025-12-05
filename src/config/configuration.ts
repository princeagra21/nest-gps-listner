import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  // Database
  database: {
    url: process.env.PRIMARY_DATABASE_URL,
    poolSize: parseInt(process.env.DB_POOL_SIZE || '50', 10),
  },
  
  // TCP Server Ports
  ports: {
    gt06: parseInt(process.env.GT06_PORT || '5023', 10),
    teltonika: parseInt(process.env.TELTONIKA_PORT || '5024', 10),
  },
  
  // Connection Configuration
  connection: {
    timeout: parseInt(process.env.CON_TIME_OUT || '5000', 10),
    socketTimeout: parseInt(process.env.SOCKET_TIMEOUT || '300000', 10),
    keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT || '120000', 10),
    maxConnectionsPerPort: parseInt(process.env.MAX_CONNECTIONS_PER_PORT || '50000', 10),
  },
  
  // Security
  security: {
    secretKey: process.env.SECRET_KEY,
  },
  
  // Data Forwarding
  dataForward: {
    url: process.env.DATA_FORWARD_URL,
  },
  
  // API Configuration
  api: {
    port: parseInt(process.env.API_PORT || '5055', 10),
  },
  
  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    

  },

    // Redis Keys - Global constants for consistent key naming

  rediskeys: {
      deviceImeiSet: 'devices:imei:set',
      deviceStatusHash: 'devices:status',
      commandQueuePrefix: 'devices:commands:',
    },
  
  // Application Configuration
  nodeEnv: process.env.NODE_ENV || 'development',
  // logLevel: process.env.LOG_LEVEL || 'info',
  logs: {
    enabled: process.env.LOG_ENABLED === 'true',
    level: process.env.LOG_LEVEL || 'info',
  },
}));
