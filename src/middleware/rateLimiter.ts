/**
 * Rate Limiting Middleware
 * Per-application rate limiting using express-rate-limit
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import logger from '../config/logger';

/**
 * Generate rate limit key based on application
 */
function getApplicationKey(req: Request): string {
  if (req.auth) {
    return `app:${req.auth.application_id}:${req.auth.key_type}`;
  }
  // Fallback to IP for unauthenticated requests
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.ip || 'unknown';
  return `ip:${ip}`;
}

/**
 * Standard API rate limiter
 * 100 requests per minute per application
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getApplicationKey,
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      key: getApplicationKey(req),
      path: req.path,
    });
    res.status(429).json({
      error: {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
        message: 'Too many requests. Please retry after 60 seconds.',
        retry_after: 60,
      },
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/ready';
  },
});

/**
 * Strict rate limiter for sensitive operations
 * 10 requests per minute
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getApplicationKey,
  handler: (req: Request, res: Response) => {
    logger.warn('Strict rate limit exceeded', {
      key: getApplicationKey(req),
      path: req.path,
    });
    res.status(429).json({
      error: {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
        message: 'Too many requests for this operation. Please retry after 60 seconds.',
        retry_after: 60,
      },
    });
  },
});

/**
 * Auth rate limiter - for login/key validation attempts
 * 20 attempts per 15 minutes by IP
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const forwarded = req.headers['x-forwarded-for'];
    return typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.ip || 'unknown';
  },
  handler: (req: Request, res: Response) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      error: {
        type: 'rate_limit_error',
        code: 'too_many_auth_attempts',
        message: 'Too many authentication attempts. Please retry after 15 minutes.',
        retry_after: 900,
      },
    });
  },
});

/**
 * Webhook rate limiter - higher limits for webhook endpoints
 * 1000 requests per minute
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getApplicationKey,
  handler: (req: Request, res: Response) => {
    logger.warn('Webhook rate limit exceeded', {
      key: getApplicationKey(req),
    });
    res.status(429).json({
      error: {
        type: 'rate_limit_error',
        code: 'webhook_rate_limit_exceeded',
        message: 'Webhook rate limit exceeded.',
        retry_after: 60,
      },
    });
  },
});

export default {
  apiRateLimiter,
  strictRateLimiter,
  authRateLimiter,
  webhookRateLimiter,
};
