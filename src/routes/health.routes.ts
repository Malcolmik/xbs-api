import { Router, Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

/**
 * Health Check Endpoint
 * GET /health
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'XBS API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };

  // Check database connection
  try {
    const dbConnected = await db.testConnection();
    
    if (!dbConnected) {
      return res.status(503).json({
        ...health,
        status: 'unhealthy',
        database: 'disconnected'
      });
    }

    // Get database pool stats
    const poolStats = db.getPoolStats();

    res.status(200).json({
      ...health,
      database: 'connected',
      databasePool: {
        total: poolStats.total,
        idle: poolStats.idle,
        waiting: poolStats.waiting
      }
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(503).json({
      ...health,
      status: 'unhealthy',
      database: 'error'
    });
  }
}));

/**
 * Readiness Check (for Kubernetes)
 * GET /ready
 */
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  try {
    await db.testConnection();
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready' });
  }
}));

/**
 * Liveness Check (for Kubernetes)
 * GET /live
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

export default router;
