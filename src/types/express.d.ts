/**
 * Express Type Extensions
 * Extends Express types with XBS authentication context
 */

import { AuthContext } from '../services/authService';

declare global {
  namespace Express {
    interface Request {
      /**
       * Correlation ID for request tracing
       */
      correlationId?: string;

      /**
       * Request start timestamp for duration calculation
       */
      startTime?: number;

      /**
       * Authentication context from validated API key
       */
      auth?: AuthContext;

      /**
       * Whether request is in test mode (derived from auth)
       */
      testMode?: boolean;
    }
  }
}

/**
 * Type guard: Check if request is authenticated
 */
export function isAuthenticated(req: Express.Request): req is Express.Request & { auth: AuthContext } {
  return req.auth !== undefined;
}

/**
 * Type guard: Check if request is in test mode
 */
export function isTestMode(req: Express.Request): boolean {
  return req.auth?.test_mode ?? true;
}

/**
 * Type guard: Check if request has secret key
 */
export function hasSecretKey(req: Express.Request): boolean {
  return req.auth?.key_type === 'sk';
}

export {};
