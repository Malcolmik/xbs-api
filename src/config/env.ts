import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment Configuration
 * Validates and exports all required environment variables
 */

interface EnvironmentConfig {
  // Server
  NODE_ENV: string;
  PORT: number;
  HOST: string;

  // Database
  DATABASE_URL: string;
  DB_POOL_MIN: number;
  DB_POOL_MAX: number;

  // API
  API_VERSION: string;
  API_RATE_LIMIT: number;

  // Logging
  LOG_LEVEL: string;
  LOG_FILE_PATH: string;

  // Security
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  API_KEY_SALT_ROUNDS: number;

  // CORS
  CORS_ORIGIN: string;
  CORS_CREDENTIALS: boolean;
}

/**
 * Validate required environment variables
 */
function validateEnv(): EnvironmentConfig {
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'ENCRYPTION_KEY'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file.'
    );
  }

  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || 'localhost',

    DATABASE_URL: process.env.DATABASE_URL!,
    DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),
    DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '10', 10),

    API_VERSION: process.env.API_VERSION || 'v1',
    API_RATE_LIMIT: parseInt(process.env.API_RATE_LIMIT || '100', 10),

    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_FILE_PATH: process.env.LOG_FILE_PATH || './logs/xbs.log',

    JWT_SECRET: process.env.JWT_SECRET!,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!,
    API_KEY_SALT_ROUNDS: parseInt(process.env.API_KEY_SALT_ROUNDS || '10', 10),

    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    CORS_CREDENTIALS: process.env.CORS_CREDENTIALS === 'true'
  };
}

export const env = validateEnv();

export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
