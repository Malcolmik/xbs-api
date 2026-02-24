import express, { Application } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { corsMiddleware } from './middleware/cors';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import healthRoutes from './routes/health.routes';
import customersRoutes from './routes/customers.routes';
import plansRoutes from './routes/plans.routes';
//import { env } from './config/env';
import { logger } from './utils/logger';

/**
 * Express Application Setup
 */

export function createApp(): Application {
  const app = express();

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  // Security headers
  app.use(helmet());

  // Response compression
  app.use(compression());

  // CORS
  app.use(corsMiddleware);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // ============================================================================
  // ROUTES
  // ============================================================================

  // Health check routes
  app.use('/', healthRoutes);

  // Customer management routes
  app.use('/v1/customers', customersRoutes);

  // Plan management routes
  app.use('/v1/plans', plansRoutes);

  // API version prefix for future routes
  // app.use(`/${env.API_VERSION}`, apiRoutes);

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}

/**
 * Initialize application
 */
export async function initializeApp(): Promise<Application> {
  logger.info('Initializing XBS API...');

  // Create Express app
  const app = createApp();

  logger.info('XBS API initialized successfully');

  return app;
}
