# XBS API Implementation Instructions

## Overview
You are implementing Section 1.3 (Authentication Middleware) and Section 2.1 (Customer Management) for XBS (Xoro Billing Service), a multi-tenant billing API similar to Stripe.

**Project Path:** `C:\Users\User\Desktop\xbs-api`
**Stack:** Node.js 18+ | TypeScript 5.3 | Express 4.18 | PostgreSQL 16

---

## Step 1: Install Dependencies

Run these commands first:

```bash
npm install bcrypt
npm install @types/bcrypt --save-dev
```

---

## Step 2: Create Services Directory

```bash
mkdir src/services
```

---

## Step 3: Create src/services/authService.ts

Create this file with the following implementation:

```typescript
/**
 * Authentication Service
 * Handles API key validation, generation, and management
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../config/database';
import { AuthenticationError, NotFoundError } from '../utils/errors';
import logger from '../config/logger';

// API Key format: xbs_{pk|sk}_{test|live}_{32 random chars}
const API_KEY_REGEX = /^xbs_(pk|sk)_(test|live)_[a-zA-Z0-9]{32}$/;
const BCRYPT_ROUNDS = 12;

export interface AuthContext {
  application_id: string;
  api_key_id: string;
  key_type: 'pk' | 'sk';
  key_role: string;
  test_mode: boolean;
  default_currency: string;
  timezone: string;
  webhook_url: string | null;
  webhook_secret: string | null;
}

export interface ApiKeyRecord {
  id: string;
  application_id: string;
  key_hash: string;
  key_type: 'pk' | 'sk';
  key_role: string;
  environment: 'test' | 'live';
  is_active: boolean;
  expires_at: Date | null;
  ip_whitelist: string[] | null;
  last_used_at: Date | null;
}

/**
 * Validate an API key and return auth context
 */
export async function validateApiKey(
  keyString: string,
  clientIp?: string
): Promise<AuthContext> {
  // Validate format
  if (!API_KEY_REGEX.test(keyString)) {
    throw new AuthenticationError('Invalid API key format');
  }

  // Parse key components
  const [, keyType, environment] = keyString.split('_') as [string, 'pk' | 'sk', 'test' | 'live'];

  // Find all active keys for this environment and type
  const keysResult = await db.query<ApiKeyRecord>(
    `SELECT ak.*, a.default_currency, a.timezone, a.webhook_url, a.webhook_secret
     FROM api_keys ak
     JOIN applications a ON ak.application_id = a.id
     WHERE ak.key_type = $1 
       AND ak.environment = $2 
       AND ak.is_active = true
       AND a.is_active = true`,
    [keyType, environment]
  );

  if (keysResult.rows.length === 0) {
    throw new AuthenticationError('Invalid API key');
  }

  // Check each key hash (bcrypt comparison)
  let matchedKey: any = null;
  for (const key of keysResult.rows) {
    const isMatch = await bcrypt.compare(keyString, key.key_hash);
    if (isMatch) {
      matchedKey = key;
      break;
    }
  }

  if (!matchedKey) {
    throw new AuthenticationError('Invalid API key');
  }

  // Check expiration
  if (matchedKey.expires_at && new Date(matchedKey.expires_at) < new Date()) {
    throw new AuthenticationError('API key has expired');
  }

  // Check IP whitelist
  if (matchedKey.ip_whitelist && matchedKey.ip_whitelist.length > 0 && clientIp) {
    if (!matchedKey.ip_whitelist.includes(clientIp)) {
      throw new AuthenticationError('IP address not whitelisted');
    }
  }

  // Update last used (fire and forget)
  updateLastUsed(matchedKey.id).catch((err) => {
    logger.warn('Failed to update last_used_at', { keyId: matchedKey.id, error: err.message });
  });

  return {
    application_id: matchedKey.application_id,
    api_key_id: matchedKey.id,
    key_type: keyType,
    key_role: matchedKey.key_role,
    test_mode: environment === 'test',
    default_currency: matchedKey.default_currency || 'NGN',
    timezone: matchedKey.timezone || 'Africa/Lagos',
    webhook_url: matchedKey.webhook_url,
    webhook_secret: matchedKey.webhook_secret,
  };
}

/**
 * Generate a new API key
 */
export async function generateApiKey(
  applicationId: string,
  keyType: 'pk' | 'sk',
  environment: 'test' | 'live',
  role: string = 'default',
  options: {
    expiresAt?: Date;
    ipWhitelist?: string[];
  } = {}
): Promise<{ key: string; keyId: string }> {
  // Generate random key
  const randomPart = crypto.randomBytes(24).toString('base64url').slice(0, 32);
  const key = `xbs_${keyType}_${environment}_${randomPart}`;

  // Hash the key
  const keyHash = await hashApiKey(key);

  // Insert into database
  const result = await db.query(
    `INSERT INTO api_keys (
      application_id, key_hash, key_type, key_role, environment,
      expires_at, ip_whitelist, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
    RETURNING id`,
    [
      applicationId,
      keyHash,
      keyType,
      role,
      environment,
      options.expiresAt || null,
      options.ipWhitelist || null,
    ]
  );

  return {
    key, // Return unhashed key (only time it's visible)
    keyId: result.rows[0].id,
  };
}

/**
 * Hash an API key using bcrypt
 */
export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

/**
 * Update last used timestamp (fire and forget)
 */
export async function updateLastUsed(keyId: string): Promise<void> {
  await db.query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
    [keyId]
  );
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  applicationId: string,
  keyId: string
): Promise<void> {
  const result = await db.query(
    `UPDATE api_keys 
     SET is_active = false, revoked_at = NOW() 
     WHERE id = $1 AND application_id = $2
     RETURNING id`,
    [keyId, applicationId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('API key not found');
  }
}

/**
 * Rotate an API key (revoke old, create new)
 */
export async function rotateApiKey(
  applicationId: string,
  keyId: string
): Promise<{ key: string; keyId: string }> {
  // Get existing key details
  const existing = await db.query<ApiKeyRecord>(
    'SELECT * FROM api_keys WHERE id = $1 AND application_id = $2 AND is_active = true',
    [keyId, applicationId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('API key not found');
  }

  const oldKey = existing.rows[0];

  // Revoke old key
  await revokeApiKey(applicationId, keyId);

  // Generate new key with same settings
  return generateApiKey(applicationId, oldKey.key_type, oldKey.environment, oldKey.key_role, {
    ipWhitelist: oldKey.ip_whitelist || undefined,
  });
}

/**
 * List API keys for an application (without hashes)
 */
export async function listApiKeys(
  applicationId: string,
  options: { includeRevoked?: boolean } = {}
): Promise<Omit<ApiKeyRecord, 'key_hash'>[]> {
  const query = options.includeRevoked
    ? 'SELECT id, application_id, key_type, key_role, environment, is_active, expires_at, ip_whitelist, last_used_at, created_at FROM api_keys WHERE application_id = $1 ORDER BY created_at DESC'
    : 'SELECT id, application_id, key_type, key_role, environment, is_active, expires_at, ip_whitelist, last_used_at, created_at FROM api_keys WHERE application_id = $1 AND is_active = true ORDER BY created_at DESC';

  const result = await db.query(query, [applicationId]);
  return result.rows;
}

export default {
  validateApiKey,
  generateApiKey,
  hashApiKey,
  updateLastUsed,
  revokeApiKey,
  rotateApiKey,
  listApiKeys,
};
```

---

## Step 4: Create src/middleware/authenticate.ts

Create this file:

```typescript
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
```

---

## Step 5: Create src/middleware/rateLimiter.ts

Create this file:

```typescript
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
```

---

## Step 6: Update src/types/express.d.ts

Replace the entire file with:

```typescript
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
```

---

## Step 7: Create src/services/customerService.ts

Create this file:

```typescript
/**
 * Customer Service
 * Handles all customer CRUD operations with multi-tenant isolation
 */

import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import logger from '../config/logger';

export interface Customer {
  id: string;
  object: 'customer';
  application_id: string;
  external_id: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  currency: string;
  locale: string;
  timezone: string;
  tax_id: string | null;
  tax_exempt: boolean;
  balance: number;
  metadata: Record<string, any>;
  test_mode: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CreateCustomerInput {
  email: string;
  external_id?: string;
  name?: string;
  phone?: string;
  currency?: string;
  locale?: string;
  timezone?: string;
  tax_id?: string;
  tax_exempt?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateCustomerInput {
  email?: string;
  external_id?: string;
  name?: string;
  phone?: string;
  currency?: string;
  locale?: string;
  timezone?: string;
  tax_id?: string;
  tax_exempt?: boolean;
  metadata?: Record<string, any>;
}

export interface ListCustomersParams {
  application_id: string;
  test_mode: boolean;
  limit?: number;
  starting_after?: string;
  email?: string;
  include_deleted?: boolean;
}

export interface ListCustomersResult {
  data: Customer[];
  has_more: boolean;
}

/**
 * Validate email format
 */
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Format customer for API response
 */
function formatCustomer(row: any): Customer {
  return {
    id: row.id,
    object: 'customer',
    application_id: row.application_id,
    external_id: row.external_id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    currency: row.currency,
    locale: row.locale,
    timezone: row.timezone,
    tax_id: row.tax_id,
    tax_exempt: row.tax_exempt,
    balance: parseInt(row.balance, 10) || 0,
    metadata: row.metadata || {},
    test_mode: row.test_mode,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

/**
 * Create a new customer
 */
export async function create(
  applicationId: string,
  testMode: boolean,
  input: CreateCustomerInput,
  defaultCurrency: string = 'NGN',
  defaultTimezone: string = 'Africa/Lagos'
): Promise<Customer> {
  // Validate email
  if (!input.email || !validateEmail(input.email)) {
    throw new ValidationError('Valid email is required');
  }

  // Check for duplicate external_id
  if (input.external_id) {
    const existing = await db.query(
      `SELECT id FROM customers 
       WHERE application_id = $1 AND external_id = $2 AND test_mode = $3 AND deleted_at IS NULL`,
      [applicationId, input.external_id, testMode]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError(`Customer with external_id '${input.external_id}' already exists`);
    }
  }

  const id = uuidv4();
  const result = await db.query(
    `INSERT INTO customers (
      id, application_id, external_id, email, name, phone,
      currency, locale, timezone, tax_id, tax_exempt,
      balance, metadata, test_mode, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
    RETURNING *`,
    [
      id,
      applicationId,
      input.external_id || null,
      input.email,
      input.name || null,
      input.phone || null,
      input.currency || defaultCurrency,
      input.locale || 'en',
      input.timezone || defaultTimezone,
      input.tax_id || null,
      input.tax_exempt || false,
      0,
      JSON.stringify(input.metadata || {}),
      testMode,
    ]
  );

  logger.info('Customer created', { customerId: id, applicationId, testMode });
  return formatCustomer(result.rows[0]);
}

/**
 * Get customer by ID
 */
export async function getById(
  applicationId: string,
  customerId: string,
  testMode: boolean,
  includeDeleted: boolean = false
): Promise<Customer> {
  const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';
  
  const result = await db.query(
    `SELECT * FROM customers 
     WHERE id = $1 AND application_id = $2 AND test_mode = $3 ${deletedClause}`,
    [customerId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Customer not found');
  }

  return formatCustomer(result.rows[0]);
}

/**
 * Get customer by external ID
 */
export async function getByExternalId(
  applicationId: string,
  externalId: string,
  testMode: boolean,
  includeDeleted: boolean = false
): Promise<Customer> {
  const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';
  
  const result = await db.query(
    `SELECT * FROM customers 
     WHERE external_id = $1 AND application_id = $2 AND test_mode = $3 ${deletedClause}`,
    [externalId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Customer not found');
  }

  return formatCustomer(result.rows[0]);
}

/**
 * Update customer
 */
export async function update(
  applicationId: string,
  customerId: string,
  testMode: boolean,
  input: UpdateCustomerInput
): Promise<Customer> {
  // Check customer exists
  await getById(applicationId, customerId, testMode);

  // Validate email if provided
  if (input.email && !validateEmail(input.email)) {
    throw new ValidationError('Invalid email format');
  }

  // Check external_id uniqueness if changing
  if (input.external_id) {
    const existing = await db.query(
      `SELECT id FROM customers 
       WHERE application_id = $1 AND external_id = $2 AND test_mode = $3 AND id != $4 AND deleted_at IS NULL`,
      [applicationId, input.external_id, testMode, customerId]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError(`Customer with external_id '${input.external_id}' already exists`);
    }
  }

  // Build dynamic update query
  const updates: string[] = ['updated_at = NOW()'];
  const values: any[] = [];
  let paramIndex = 1;

  const fields: (keyof UpdateCustomerInput)[] = [
    'email', 'external_id', 'name', 'phone', 'currency',
    'locale', 'timezone', 'tax_id', 'tax_exempt', 'metadata'
  ];

  for (const field of fields) {
    if (input[field] !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(field === 'metadata' ? JSON.stringify(input[field]) : input[field]);
      paramIndex++;
    }
  }

  values.push(customerId, applicationId, testMode);

  const result = await db.query(
    `UPDATE customers SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND application_id = $${paramIndex + 1} AND test_mode = $${paramIndex + 2}
     RETURNING *`,
    values
  );

  logger.info('Customer updated', { customerId, applicationId });
  return formatCustomer(result.rows[0]);
}

/**
 * Soft delete customer
 */
export async function deleteCustomer(
  applicationId: string,
  customerId: string,
  testMode: boolean
): Promise<Customer> {
  // Check exists and not already deleted
  await getById(applicationId, customerId, testMode);

  const result = await db.query(
    `UPDATE customers SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND application_id = $2 AND test_mode = $3
     RETURNING *`,
    [customerId, applicationId, testMode]
  );

  logger.info('Customer deleted', { customerId, applicationId });
  return formatCustomer(result.rows[0]);
}

/**
 * Restore soft-deleted customer
 */
export async function restore(
  applicationId: string,
  customerId: string,
  testMode: boolean
): Promise<Customer> {
  const result = await db.query(
    `UPDATE customers SET deleted_at = NULL, updated_at = NOW()
     WHERE id = $1 AND application_id = $2 AND test_mode = $3 AND deleted_at IS NOT NULL
     RETURNING *`,
    [customerId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Deleted customer not found');
  }

  logger.info('Customer restored', { customerId, applicationId });
  return formatCustomer(result.rows[0]);
}

/**
 * List customers with cursor pagination
 */
export async function list(params: ListCustomersParams): Promise<ListCustomersResult> {
  const {
    application_id,
    test_mode,
    limit = 10,
    starting_after,
    email,
    include_deleted = false,
  } = params;

  const safeLimit = Math.min(Math.max(1, limit), 100);
  const conditions: string[] = ['application_id = $1', 'test_mode = $2'];
  const values: any[] = [application_id, test_mode];
  let paramIndex = 3;

  if (!include_deleted) {
    conditions.push('deleted_at IS NULL');
  }

  if (email) {
    conditions.push(`email ILIKE $${paramIndex}`);
    values.push(`%${email}%`);
    paramIndex++;
  }

  if (starting_after) {
    conditions.push(`created_at < (SELECT created_at FROM customers WHERE id = $${paramIndex})`);
    values.push(starting_after);
    paramIndex++;
  }

  values.push(safeLimit + 1); // Fetch one extra to check has_more

  const result = await db.query(
    `SELECT * FROM customers
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${paramIndex}`,
    values
  );

  const hasMore = result.rows.length > safeLimit;
  const data = result.rows.slice(0, safeLimit).map(formatCustomer);

  return { data, has_more: hasMore };
}

/**
 * Update customer balance
 */
export async function updateBalance(
  applicationId: string,
  customerId: string,
  testMode: boolean,
  amount: number,
  description?: string
): Promise<Customer> {
  await getById(applicationId, customerId, testMode);

  const result = await db.query(
    `UPDATE customers SET balance = balance + $1, updated_at = NOW()
     WHERE id = $2 AND application_id = $3 AND test_mode = $4
     RETURNING *`,
    [amount, customerId, applicationId, testMode]
  );

  logger.info('Customer balance updated', { customerId, amount, description });
  return formatCustomer(result.rows[0]);
}

/**
 * Merge metadata (shallow merge)
 */
export async function mergeMetadata(
  applicationId: string,
  customerId: string,
  testMode: boolean,
  metadata: Record<string, any>
): Promise<Customer> {
  const result = await db.query(
    `UPDATE customers 
     SET metadata = metadata || $1::jsonb, updated_at = NOW()
     WHERE id = $2 AND application_id = $3 AND test_mode = $4 AND deleted_at IS NULL
     RETURNING *`,
    [JSON.stringify(metadata), customerId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Customer not found');
  }

  return formatCustomer(result.rows[0]);
}

export default {
  create,
  getById,
  getByExternalId,
  update,
  delete: deleteCustomer,
  restore,
  list,
  updateBalance,
  mergeMetadata,
};
```

---

## Step 8: Create src/routes/customers.routes.ts

Create this file:

```typescript
/**
 * Customer Routes
 * RESTful endpoints for customer management
 */

import { Router, Request, Response, NextFunction } from 'express';
import customerService from '../services/customerService';
import { authenticate } from '../middleware/authenticate';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

const router = Router();

// Apply authentication and rate limiting to all routes
router.use(authenticate);
router.use(apiRateLimiter);

/**
 * POST /v1/customers
 * Create a new customer
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.create(
      req.auth!.application_id,
      req.auth!.test_mode,
      req.body,
      req.auth!.default_currency,
      req.auth!.timezone
    );

    res.status(201).json({ data: customer });
  })
);

/**
 * GET /v1/customers
 * List customers with pagination
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await customerService.list({
      application_id: req.auth!.application_id,
      test_mode: req.auth!.test_mode,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
      starting_after: req.query.starting_after as string,
      email: req.query.email as string,
      include_deleted: req.query.include_deleted === 'true',
    });

    res.json(result);
  })
);

/**
 * GET /v1/customers/:id
 * Get customer by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.getById(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.query.include_deleted === 'true'
    );

    res.json({ data: customer });
  })
);

/**
 * GET /v1/customers/external/:external_id
 * Get customer by external ID
 */
router.get(
  '/external/:external_id',
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.getByExternalId(
      req.auth!.application_id,
      req.params.external_id,
      req.auth!.test_mode,
      req.query.include_deleted === 'true'
    );

    res.json({ data: customer });
  })
);

/**
 * PATCH /v1/customers/:id
 * Update customer (partial)
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.update(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.body
    );

    res.json({ data: customer });
  })
);

/**
 * PUT /v1/customers/:id
 * Update customer (full - same as PATCH for flexibility)
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.update(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.body
    );

    res.json({ data: customer });
  })
);

/**
 * DELETE /v1/customers/:id
 * Soft delete customer
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.delete(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode
    );

    res.json({ data: customer, deleted: true });
  })
);

/**
 * POST /v1/customers/:id/restore
 * Restore soft-deleted customer
 */
router.post(
  '/:id/restore',
  asyncHandler(async (req: Request, res: Response) => {
    const customer = await customerService.restore(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode
    );

    res.json({ data: customer });
  })
);

/**
 * POST /v1/customers/:id/balance
 * Adjust customer balance
 */
router.post(
  '/:id/balance',
  asyncHandler(async (req: Request, res: Response) => {
    const { amount, description } = req.body;

    if (typeof amount !== 'number') {
      throw new ValidationError('amount must be a number');
    }

    const customer = await customerService.updateBalance(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      amount,
      description
    );

    res.json({ data: customer });
  })
);

/**
 * POST /v1/customers/:id/metadata
 * Merge customer metadata
 */
router.post(
  '/:id/metadata',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.metadata || typeof req.body.metadata !== 'object') {
      throw new ValidationError('metadata must be an object');
    }

    const customer = await customerService.mergeMetadata(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.body.metadata
    );

    res.json({ data: customer });
  })
);

export default router;
```

---

## Step 9: Update src/app.ts

Add these lines to your existing app.ts:

**Add import at top:**
```typescript
import customersRoutes from './routes/customers.routes';
```

**Add route registration (before error handler):**
```typescript
app.use('/v1/customers', customersRoutes);
```

---

## Step 10: Verify Implementation

After creating all files, run:

```bash
npm run build
```

If TypeScript compiles without errors, the implementation is complete.

---

## Testing

Start the server:
```bash
npm run dev
```

Test endpoints (you'll need a valid API key in your database):
```bash
# Create customer
curl -X POST http://localhost:3000/v1/customers \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'

# List customers
curl http://localhost:3000/v1/customers \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY"
```

---

## Summary

You have implemented:
- **Section 1.3**: Authentication middleware with bcrypt API key validation, rate limiting
- **Section 2.1**: Customer CRUD with soft deletes, cursor pagination, multi-tenant isolation

Next sections to implement: 2.2 (Plans), 2.3 (Subscriptions), 3.x (Billing)
