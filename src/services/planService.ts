/**
 * Plan Service
 * Handles subscription plan CRUD operations with pricing tiers
 */

import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import logger from '../config/logger';

// Types
export type BillingInterval = 'day' | 'week' | 'month' | 'year';
export type PricingModel = 'flat' | 'per_unit' | 'tiered' | 'volume';
export type TierMode = 'graduated' | 'volume';
export type PlanStatus = 'active' | 'archived' | 'draft';

export interface PriceTier {
  up_to: number | null; // null = infinity
  unit_amount: number;
  flat_amount?: number;
}

export interface PlanPrice {
  id: string;
  currency: string;
  unit_amount: number; // Amount in smallest currency unit (kobo, cents)
  pricing_model: PricingModel;
  tiers?: PriceTier[];
  tier_mode?: TierMode;
}

export interface Plan {
  id: string;
  object: 'plan';
  application_id: string;
  external_id: string | null;
  name: string;
  description: string | null;
  billing_interval: BillingInterval;
  billing_interval_count: number;
  prices: PlanPrice[];
  trial_period_days: number;
  features: Record<string, any>;
  metadata: Record<string, any>;
  status: PlanStatus;
  test_mode: boolean;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
}

export interface CreatePlanInput {
  external_id?: string;
  name: string;
  description?: string;
  billing_interval: BillingInterval;
  billing_interval_count?: number;
  prices: {
    currency: string;
    unit_amount: number;
    pricing_model?: PricingModel;
    tiers?: PriceTier[];
    tier_mode?: TierMode;
  }[];
  trial_period_days?: number;
  features?: Record<string, any>;
  metadata?: Record<string, any>;
  status?: PlanStatus;
}

export interface UpdatePlanInput {
  external_id?: string;
  name?: string;
  description?: string;
  trial_period_days?: number;
  features?: Record<string, any>;
  metadata?: Record<string, any>;
  status?: PlanStatus;
}

export interface ListPlansParams {
  application_id: string;
  test_mode: boolean;
  limit?: number;
  starting_after?: string;
  status?: PlanStatus;
  include_archived?: boolean;
}

export interface ListPlansResult {
  data: Plan[];
  has_more: boolean;
}

// Validation constants
const VALID_INTERVALS: BillingInterval[] = ['day', 'week', 'month', 'year'];
const VALID_PRICING_MODELS: PricingModel[] = ['flat', 'per_unit', 'tiered', 'volume'];
const VALID_STATUSES: PlanStatus[] = ['active', 'archived', 'draft'];
const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'KES', 'GHS', 'ZAR', 'XOF', 'XAF', 'EGP', 'TZS'];

/**
 * Validate plan input
 */
function validatePlanInput(input: CreatePlanInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('Plan name is required');
  }

  if (!VALID_INTERVALS.includes(input.billing_interval)) {
    throw new ValidationError(`Invalid billing_interval. Must be one of: ${VALID_INTERVALS.join(', ')}`);
  }

  if (input.billing_interval_count !== undefined && input.billing_interval_count < 1) {
    throw new ValidationError('billing_interval_count must be at least 1');
  }

  if (!input.prices || input.prices.length === 0) {
    throw new ValidationError('At least one price is required');
  }

  for (const price of input.prices) {
    if (!price.currency || !SUPPORTED_CURRENCIES.includes(price.currency.toUpperCase())) {
      throw new ValidationError(`Invalid currency: ${price.currency}. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
    }

    if (typeof price.unit_amount !== 'number' || price.unit_amount < 0) {
      throw new ValidationError('unit_amount must be a non-negative number');
    }

    if (price.pricing_model && !VALID_PRICING_MODELS.includes(price.pricing_model)) {
      throw new ValidationError(`Invalid pricing_model. Must be one of: ${VALID_PRICING_MODELS.join(', ')}`);
    }

    // Validate tiers if tiered pricing
    if (price.pricing_model === 'tiered' || price.pricing_model === 'volume') {
      if (!price.tiers || price.tiers.length === 0) {
        throw new ValidationError('Tiers are required for tiered/volume pricing');
      }
      validateTiers(price.tiers);
    }
  }

  if (input.trial_period_days !== undefined && input.trial_period_days < 0) {
    throw new ValidationError('trial_period_days must be non-negative');
  }

  if (input.status && !VALID_STATUSES.includes(input.status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }
}

/**
 * Validate pricing tiers
 */
function validateTiers(tiers: PriceTier[]): void {
  let lastUpTo = 0;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];

    if (typeof tier.unit_amount !== 'number' || tier.unit_amount < 0) {
      throw new ValidationError(`Tier ${i + 1}: unit_amount must be non-negative`);
    }

    if (tier.up_to !== null) {
      if (typeof tier.up_to !== 'number' || tier.up_to <= lastUpTo) {
        throw new ValidationError(`Tier ${i + 1}: up_to must be greater than previous tier`);
      }
      lastUpTo = tier.up_to;
    } else if (i !== tiers.length - 1) {
      throw new ValidationError('Only the last tier can have up_to = null (infinity)');
    }
  }
}

/**
 * Format plan for API response
 */
function formatPlan(row: any): Plan {
  return {
    id: row.id,
    object: 'plan',
    application_id: row.application_id,
    external_id: row.external_id,
    name: row.name,
    description: row.description,
    billing_interval: row.billing_interval,
    billing_interval_count: row.billing_interval_count,
    prices: row.prices || [],
    trial_period_days: row.trial_period_days || 0,
    features: row.features || {},
    metadata: row.metadata || {},
    status: row.status,
    test_mode: row.test_mode,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
  };
}

/**
 * Create a new plan
 */
export async function create(
  applicationId: string,
  testMode: boolean,
  input: CreatePlanInput
): Promise<Plan> {
  validatePlanInput(input);

  // Check for duplicate external_id
  if (input.external_id) {
    const existing = await db.query(
      `SELECT id FROM plans
       WHERE application_id = $1 AND external_id = $2 AND test_mode = $3`,
      [applicationId, input.external_id, testMode]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError(`Plan with external_id '${input.external_id}' already exists`);
    }
  }

  // Format prices with IDs
  const prices: PlanPrice[] = input.prices.map((p) => ({
    id: uuidv4(),
    currency: p.currency.toUpperCase(),
    unit_amount: p.unit_amount,
    pricing_model: p.pricing_model || 'flat',
    tiers: p.tiers,
    tier_mode: p.tier_mode,
  }));

  const id = uuidv4();
  const result = await db.query(
    `INSERT INTO plans (
      id, application_id, external_id, name, description,
      billing_interval, billing_interval_count, prices,
      trial_period_days, features, metadata, status, test_mode,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
    RETURNING *`,
    [
      id,
      applicationId,
      input.external_id || null,
      input.name.trim(),
      input.description || null,
      input.billing_interval,
      input.billing_interval_count || 1,
      JSON.stringify(prices),
      input.trial_period_days || 0,
      JSON.stringify(input.features || {}),
      JSON.stringify(input.metadata || {}),
      input.status || 'active',
      testMode,
    ]
  );

  logger.info('Plan created', { planId: id, applicationId, testMode });
  return formatPlan(result.rows[0]);
}

/**
 * Get plan by ID
 */
export async function getById(
  applicationId: string,
  planId: string,
  testMode: boolean,
  includeArchived: boolean = false
): Promise<Plan> {
  const archivedClause = includeArchived ? '' : "AND status != 'archived'";

  const result = await db.query(
    `SELECT * FROM plans
     WHERE id = $1 AND application_id = $2 AND test_mode = $3 ${archivedClause}`,
    [planId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Plan not found');
  }

  return formatPlan(result.rows[0]);
}

/**
 * Get plan by external ID
 */
export async function getByExternalId(
  applicationId: string,
  externalId: string,
  testMode: boolean,
  includeArchived: boolean = false
): Promise<Plan> {
  const archivedClause = includeArchived ? '' : "AND status != 'archived'";

  const result = await db.query(
    `SELECT * FROM plans
     WHERE external_id = $1 AND application_id = $2 AND test_mode = $3 ${archivedClause}`,
    [externalId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Plan not found');
  }

  return formatPlan(result.rows[0]);
}

/**
 * Update plan (limited fields - prices cannot be changed after creation)
 */
export async function update(
  applicationId: string,
  planId: string,
  testMode: boolean,
  input: UpdatePlanInput
): Promise<Plan> {
  // Check plan exists
  const existing = await getById(applicationId, planId, testMode, true);

  // Cannot update archived plans (except to unarchive via status)
  if (existing.status === 'archived' && input.status !== 'active' && input.status !== 'draft') {
    throw new ValidationError('Cannot update archived plan. Change status first.');
  }

  // Check external_id uniqueness if changing
  if (input.external_id && input.external_id !== existing.external_id) {
    const duplicate = await db.query(
      `SELECT id FROM plans
       WHERE application_id = $1 AND external_id = $2 AND test_mode = $3 AND id != $4`,
      [applicationId, input.external_id, testMode, planId]
    );
    if (duplicate.rows.length > 0) {
      throw new ConflictError(`Plan with external_id '${input.external_id}' already exists`);
    }
  }

  if (input.status && !VALID_STATUSES.includes(input.status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  // Build dynamic update query
  const updates: string[] = ['updated_at = NOW()'];
  const values: any[] = [];
  let paramIndex = 1;

  const allowedFields: (keyof UpdatePlanInput)[] = [
    'external_id', 'name', 'description', 'trial_period_days',
    'features', 'metadata', 'status'
  ];

  for (const field of allowedFields) {
    if (input[field] !== undefined) {
      if (field === 'features' || field === 'metadata') {
        updates.push(`${field} = $${paramIndex}`);
        values.push(JSON.stringify(input[field]));
      } else if (field === 'name' && input.name) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(input.name.trim());
      } else {
        updates.push(`${field} = $${paramIndex}`);
        values.push(input[field]);
      }
      paramIndex++;
    }
  }

  // Handle archiving
  if (input.status === 'archived') {
    updates.push(`archived_at = NOW()`);
  } else if (input.status && existing.status === 'archived') {
    updates.push(`archived_at = NULL`);
  }

  values.push(planId, applicationId, testMode);

  const result = await db.query(
    `UPDATE plans SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND application_id = $${paramIndex + 1} AND test_mode = $${paramIndex + 2}
     RETURNING *`,
    values
  );

  logger.info('Plan updated', { planId, applicationId });
  return formatPlan(result.rows[0]);
}

/**
 * Archive plan (soft delete - existing subscriptions continue)
 */
export async function archive(
  applicationId: string,
  planId: string,
  testMode: boolean
): Promise<Plan> {
  const existing = await getById(applicationId, planId, testMode, true);

  if (existing.status === 'archived') {
    throw new ValidationError('Plan is already archived');
  }

  const result = await db.query(
    `UPDATE plans
     SET status = 'archived', archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND application_id = $2 AND test_mode = $3
     RETURNING *`,
    [planId, applicationId, testMode]
  );

  logger.info('Plan archived', { planId, applicationId });
  return formatPlan(result.rows[0]);
}

/**
 * Unarchive plan
 */
export async function unarchive(
  applicationId: string,
  planId: string,
  testMode: boolean
): Promise<Plan> {
  const result = await db.query(
    `UPDATE plans
     SET status = 'active', archived_at = NULL, updated_at = NOW()
     WHERE id = $1 AND application_id = $2 AND test_mode = $3 AND status = 'archived'
     RETURNING *`,
    [planId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Archived plan not found');
  }

  logger.info('Plan unarchived', { planId, applicationId });
  return formatPlan(result.rows[0]);
}

/**
 * List plans with cursor pagination
 */
export async function list(params: ListPlansParams): Promise<ListPlansResult> {
  const {
    application_id,
    test_mode,
    limit = 10,
    starting_after,
    status,
    include_archived = false,
  } = params;

  const safeLimit = Math.min(Math.max(1, limit), 100);
  const conditions: string[] = ['application_id = $1', 'test_mode = $2'];
  const values: any[] = [application_id, test_mode];
  let paramIndex = 3;

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  } else if (!include_archived) {
    conditions.push("status != 'archived'");
  }

  if (starting_after) {
    conditions.push(`created_at < (SELECT created_at FROM plans WHERE id = $${paramIndex})`);
    values.push(starting_after);
    paramIndex++;
  }

  values.push(safeLimit + 1);

  const result = await db.query(
    `SELECT * FROM plans
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${paramIndex}`,
    values
  );

  const hasMore = result.rows.length > safeLimit;
  const data = result.rows.slice(0, safeLimit).map(formatPlan);

  return { data, has_more: hasMore };
}

/**
 * Get price for a specific currency
 */
export function getPriceForCurrency(plan: Plan, currency: string): PlanPrice | null {
  return plan.prices.find((p) => p.currency === currency.toUpperCase()) || null;
}

/**
 * Calculate price for quantity (handles tiered pricing)
 */
export function calculatePrice(price: PlanPrice, quantity: number = 1): number {
  if (price.pricing_model === 'flat') {
    return price.unit_amount;
  }

  if (price.pricing_model === 'per_unit') {
    return price.unit_amount * quantity;
  }

  if (price.pricing_model === 'tiered' && price.tiers) {
    // Graduated: each tier applies to units in that range
    let total = 0;
    let remaining = quantity;

    for (const tier of price.tiers) {
      const tierLimit = tier.up_to === null ? remaining : tier.up_to;
      const unitsInTier = Math.min(remaining, tierLimit);

      total += unitsInTier * tier.unit_amount;
      if (tier.flat_amount) {
        total += tier.flat_amount;
      }

      remaining -= unitsInTier;
      if (remaining <= 0) break;
    }

    return total;
  }

  if (price.pricing_model === 'volume' && price.tiers) {
    // Volume: single tier applies to all units
    for (const tier of price.tiers) {
      if (tier.up_to === null || quantity <= tier.up_to) {
        let total = quantity * tier.unit_amount;
        if (tier.flat_amount) {
          total += tier.flat_amount;
        }
        return total;
      }
    }
  }

  return price.unit_amount * quantity;
}

/**
 * Clone a plan (create copy with new ID)
 */
export async function clone(
  applicationId: string,
  planId: string,
  testMode: boolean,
  overrides: Partial<CreatePlanInput> = {}
): Promise<Plan> {
  const existing = await getById(applicationId, planId, testMode, true);

  const input: CreatePlanInput = {
    external_id: overrides.external_id,
    name: overrides.name || `${existing.name} (Copy)`,
    description: overrides.description ?? existing.description ?? undefined,
    billing_interval: overrides.billing_interval || existing.billing_interval,
    billing_interval_count: overrides.billing_interval_count || existing.billing_interval_count,
    prices: overrides.prices || existing.prices.map((p) => ({
      currency: p.currency,
      unit_amount: p.unit_amount,
      pricing_model: p.pricing_model,
      tiers: p.tiers,
      tier_mode: p.tier_mode,
    })),
    trial_period_days: overrides.trial_period_days ?? existing.trial_period_days,
    features: overrides.features || existing.features,
    metadata: overrides.metadata || existing.metadata,
    status: 'draft', // Cloned plans start as draft
  };

  return create(applicationId, testMode, input);
}

export default {
  create,
  getById,
  getByExternalId,
  update,
  archive,
  unarchive,
  list,
  getPriceForCurrency,
  calculatePrice,
  clone,
};
