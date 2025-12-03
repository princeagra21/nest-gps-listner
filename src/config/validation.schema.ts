import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Database
  PRIMARY_DATABASE_URL: Joi.string().required(),
  DB_POOL_SIZE: Joi.number().default(50),
  
  // TCP Server Ports
  GT06_PORT: Joi.number().default(5023),
  TELTONIKA_PORT: Joi.number().default(5024),
  
  // Connection Configuration
  CON_TIME_OUT: Joi.number().default(5000),
  SOCKET_TIMEOUT: Joi.number().default(300000),
  KEEP_ALIVE_TIMEOUT: Joi.number().default(120000),
  MAX_CONNECTIONS_PER_PORT: Joi.number().default(50000),
  
  // Security
  SECRET_KEY: Joi.string().required(),
  
  // Data Forwarding
  DATA_FORWARD_URL: Joi.string().uri().required(),
  
  // API Configuration
  API_PORT: Joi.number().default(5055),
  
  // Redis Configuration
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),
  
  // Application Configuration
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'staging')
    .default('development'),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),
});
