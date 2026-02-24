import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request Logger Middleware
 * Logs all incoming requests with correlation IDs
 */

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Generate or use existing correlation ID
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  req.correlationId = correlationId;
  req.startTime = Date.now();

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Log request
  logger.info('Incoming request', {
    correlationId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());
    
    logger.info('Request completed', {
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration
    });
  });

  next();
}
