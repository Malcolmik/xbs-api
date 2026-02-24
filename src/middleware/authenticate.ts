/**
 * Authentication Middleware
 * Validates API keys and injects auth context into requests
 */

import { Request, Response, NextFunction } from 'express';
import { validateApiKey, AuthContext } from '../services/authService';
import { AuthenticationError } from '../utils/errors';
import logger from '../config/logger';

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  return token;
}

/**
 * Get client IP address
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Main authentication middleware
 * Requires valid API key, injects req.auth
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      throw new AuthenticationError('Missing API key. Include Authorization: Bearer <api_key>');
    }

    const clientIp = getClientIp(req);
    const authContext = await validateApiKey(token, clientIp);

    // Inject into request
    req.auth = authContext;
    req.testMode = authContext.test_mode;

    logger.debug('Request authenticated', {
      applicationId: authContext.application_id,
      keyType: authContext.key_type,
      testMode: authContext.test_mode,
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware
 * Sets auth if provided, continues without if missing
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);

    if (token) {
      const clientIp = getClientIp(req);
      const authContext = await validateApiKey(token, clientIp);
      req.auth = authContext;
      req.testMode = authContext.test_mode;
    }

    next();
  } catch (error) {
    // Log but don't fail - auth is optional
    logger.debug('Optional auth failed', { error: (error as Error).message });
    next();
  }
}

/**
 * Require secret key (sk) - for sensitive operations
 */
export function requireSecretKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    return next(new AuthenticationError('Authentication required'));
  }

  if (req.auth.key_type !== 'sk') {
    return next(new AuthenticationError('Secret key required for this operation'));
  }

  next();
}

/**
 * Require live mode - for production operations
 */
export function requireLiveMode(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.auth) {
    return next(new AuthenticationError('Authentication required'));
  }

  if (req.auth.test_mode) {
    return next(new AuthenticationError('Live mode API key required'));
  }

  next();
}

/**
 * Combined scope requirements
 */
export function scopedAuth(options: {
  requireSecret?: boolean;
  requireLive?: boolean;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (options.requireSecret && req.auth.key_type !== 'sk') {
      return next(new AuthenticationError('Secret key required'));
    }

    if (options.requireLive && req.auth.test_mode) {
      return next(new AuthenticationError('Live mode required'));
    }

    next();
  };
}

export default {
  authenticate,
  optionalAuth,
  requireSecretKey,
  requireLiveMode,
  scopedAuth,
};
