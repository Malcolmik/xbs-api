import { initializeApp } from './app';
import { env } from './config/env';
import { db } from './config/database';
import { logger } from './utils/logger';

/**
 * XBS API Server
 * Entry point for the application
 */

async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      logger.error('Failed to connect to database');
      process.exit(1);
    }

    // Initialize application
    const app = await initializeApp();

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info('='.repeat(50));
      logger.info(`🚀 XBS API Server Started`);
      logger.info(`📍 Environment: ${env.NODE_ENV}`);
      logger.info(`🌍 Host: ${env.HOST}`);
      logger.info(`🔌 Port: ${env.PORT}`);
      logger.info(`🏥 Health Check: http://${env.HOST}:${env.PORT}/health`);
      logger.info(`📊 Database Pool: ${db.getPoolStats().total} connections`);
      logger.info('='.repeat(50));
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Close database connections
        await db.close();
        logger.info('Database connections closed');
        
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forcing shutdown after timeout');
        process.exit(1);
      }, 30000);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received: closing HTTP server');
      
      server.close(async () => {
        logger.info('HTTP server closed');
        await db.close();
        logger.info('Database connections closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection', {
    reason: reason.message || reason
  });
  process.exit(1);
});

// Start the server
startServer();
