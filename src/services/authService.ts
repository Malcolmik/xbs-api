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
  key_prefix: string;
  key_hash: string;
  key_type: string;   // 'test' | 'live' in DB
  key_role: string;   // 'publishable' | 'secret' in DB
  active: boolean;
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
  const parts = keyString.split('_');
  const keyType = parts[1] as 'pk' | 'sk';
  const environment = parts[2] as 'test' | 'live';
  const prefix = `xbs_${keyType}_${environment}_`;

  // Find all active keys matching this prefix
  const keysResult = await db.query<any>(
    `SELECT ak.id, ak.application_id, ak.key_prefix, ak.key_hash, ak.key_type,
            ak.key_role, ak.active, ak.expires_at, ak.ip_whitelist, ak.last_used_at,
            a.default_currency, a.timezone, a.webhook_url, a.webhook_secret
     FROM api_keys ak
     JOIN applications a ON ak.application_id = a.id
     WHERE ak.key_prefix = $1
       AND ak.active = true
       AND a.active = true`,
    [prefix]
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
  // Generate random key (hex = only [0-9a-f], safe for regex and splitting on _)
  const randomPart = crypto.randomBytes(16).toString('hex'); // exactly 32 hex chars
  const key = `xbs_${keyType}_${environment}_${randomPart}`;
  const prefix = `xbs_${keyType}_${environment}_`;

  // Map pk/sk to publishable/secret for DB storage
  const dbKeyRole = keyType === 'pk' ? 'publishable' : 'secret';
  // DB key_type stores the environment: 'test' | 'live'
  const dbKeyType = environment;

  // Hash the key
  const keyHash = await hashApiKey(key);

  // Insert into database using actual schema columns
  const result = await db.query(
    `INSERT INTO api_keys (
      application_id, key_prefix, key_hash, key_type, key_role,
      expires_at, ip_whitelist, active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
    RETURNING id`,
    [
      applicationId,
      prefix,
      keyHash,
      dbKeyType,
      dbKeyRole,
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
     SET active = false
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
    'SELECT * FROM api_keys WHERE id = $1 AND application_id = $2 AND active = true',
    [keyId, applicationId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('API key not found');
  }

  const oldKey = existing.rows[0];

  // Derive pk/sk from key_prefix (e.g. 'xbs_pk_test_' → 'pk')
  const prefixParts = oldKey.key_prefix.split('_');
  const pkSk = prefixParts[1] as 'pk' | 'sk';
  const environment = prefixParts[2] as 'test' | 'live';

  // Revoke old key
  await revokeApiKey(applicationId, keyId);

  // Generate new key with same settings
  return generateApiKey(applicationId, pkSk, environment, oldKey.key_role, {
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
    ? 'SELECT id, application_id, key_prefix, key_type, key_role, active, expires_at, ip_whitelist, last_used_at, created_at FROM api_keys WHERE application_id = $1 ORDER BY created_at DESC'
    : 'SELECT id, application_id, key_prefix, key_type, key_role, active, expires_at, ip_whitelist, last_used_at, created_at FROM api_keys WHERE application_id = $1 AND active = true ORDER BY created_at DESC';

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
