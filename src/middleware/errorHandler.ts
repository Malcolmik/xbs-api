import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { isDevelopment } from '../config/env';

/**
 * Global Error Handler Middleware
 */

interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    statusCode: number;
    stack?: string;
    details?: any;
  };
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Default to 500 server error
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred';

  // If it's our custom AppError
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code || code;
    message = err.message;
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.message;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid or missing authentication';
  }

  // Log the error
  logger.error('Error occurred', {
    statusCode,
    code,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Prepare error response
  const errorResponse: ErrorResponse = {
    error: {
      message,
      code,
      statusCode
    }
  };

  // Include stack trace in development
  if (isDevelopment) {
    errorResponse.error.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found Handler
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const error = new AppError(
    `Route ${req.method} ${req.path} not found`,
    404,
    'NOT_FOUND'
  );
  next(error);
}

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
