# XBS API Implementation Instructions - Section 2.3: Subscription Management

## Overview
You are implementing Section 2.3 (Subscription Management) for XBS. Subscriptions connect customers to plans, handling billing cycles, trials, upgrades, and cancellations.

**Project Path:** `C:\Users\User\Desktop\xbs-api`
**Prerequisites:** Sections 1.3, 2.1, and 2.2 must be completed first.

---

## Step 1: Create src/services/subscriptionService.ts

Create this file:

```typescript
/**
 * Subscription Service
 * Handles subscription lifecycle: create, upgrade, downgrade, cancel, pause
 */

import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import logger from '../config/logger';
import planService, { Plan } from './planService';
import customerService from './customerService';

// Types
export type SubscriptionStatus = 
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'
  | 'unpaid'
  | 'incomplete';

export type CancellationReason =
  | 'customer_request'
  | 'payment_failure'
  | 'plan_change'
  | 'fraud'
  | 'other';

export interface SubscriptionItem {
  id: string;
  plan_id: string;
  price_id: string;
  quantity: number;
}

export interface Subscription {
  id: string;
  object: 'subscription';
  application_id: string;
  customer_id: string;
  external_id: string | null;
  status: SubscriptionStatus;
  items: SubscriptionItem[];
  currency: string;
  current_period_start: Date;
  current_period_end: Date;
  trial_start: Date | null;
  trial_end: Date | null;
  cancel_at: Date | null;
  canceled_at: Date | null;
  cancellation_reason: CancellationReason | null;
  cancel_at_period_end: boolean;
  pause_start: Date | null;
  pause_end: Date | null;
  billing_cycle_anchor: Date;
  metadata: Record<string, any>;
  test_mode: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSubscriptionInput {
  customer_id: string;
  plan_id: string;
  external_id?: string;
  currency?: string;
  quantity?: number;
  trial_period_days?: number;
  trial_end?: Date;
  billing_cycle_anchor?: Date;
  metadata?: Record<string, any>;
}

export interface UpdateSubscriptionInput {
  external_id?: string;
  quantity?: number;
  metadata?: Record<string, any>;
}

export interface ListSubscriptionsParams {
  application_id: string;
  test_mode: boolean;
  customer_id?: string;
  plan_id?: string;
  status?: SubscriptionStatus;
  limit?: number;
  starting_after?: string;
}

export interface ListSubscriptionsResult {
  data: Subscription[];
  has_more: boolean;
}

/**
 * Calculate period end based on billing interval
 */
function calculatePeriodEnd(
  start: Date,
  interval: string,
  intervalCount: number
): Date {
  const end = new Date(start);

  switch (interval) {
    case 'day':
      end.setDate(end.getDate() + intervalCount);
      break;
    case 'week':
      end.setDate(end.getDate() + (7 * intervalCount));
      break;
    case 'month':
      end.setMonth(end.getMonth() + intervalCount);
      break;
    case 'year':
      end.setFullYear(end.getFullYear() + intervalCount);
      break;
  }

  return end;
}

/**
 * Format subscription for API response
 */
function formatSubscription(row: any): Subscription {
  return {
    id: row.id,
    object: 'subscription',
    application_id: row.application_id,
    customer_id: row.customer_id,
    external_id: row.external_id,
    status: row.status,
    items: row.items || [],
    currency: row.currency,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    trial_start: row.trial_start,
    trial_end: row.trial_end,
    cancel_at: row.cancel_at,
    canceled_at: row.canceled_at,
    cancellation_reason: row.cancellation_reason,
    cancel_at_period_end: row.cancel_at_period_end || false,
    pause_start: row.pause_start,
    pause_end: row.pause_end,
    billing_cycle_anchor: row.billing_cycle_anchor,
    metadata: row.metadata || {},
    test_mode: row.test_mode,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Create a new subscription
 */
export async function create(
  applicationId: string,
  testMode: boolean,
  input: CreateSubscriptionInput,
  defaultCurrency: string = 'NGN'
): Promise<Subscription> {
  // Validate customer exists
  await customerService.getById(applicationId, input.customer_id, testMode);

  // Validate plan exists and is active
  const plan = await planService.getById(applicationId, input.plan_id, testMode);
  if (plan.status !== 'active') {
    throw new ValidationError('Cannot subscribe to inactive plan');
  }

  // Check for duplicate external_id
  if (input.external_id) {
    const existing = await db.query(
      `SELECT id FROM subscriptions 
       WHERE application_id = $1 AND external_id = $2 AND test_mode = $3`,
      [applicationId, input.external_id, testMode]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError(`Subscription with external_id '${input.external_id}' already exists`);
    }
  }

  // Determine currency
  const currency = (input.currency || defaultCurrency).toUpperCase();
  const price = planService.getPriceForCurrency(plan, currency);
  if (!price) {
    throw new ValidationError(`Plan does not have pricing for currency: ${currency}`);
  }

  // Calculate dates
  const now = new Date();
  const billingAnchor = input.billing_cycle_anchor || now;
  
  // Trial handling
  let trialStart: Date | null = null;
  let trialEnd: Date | null = null;
  let periodStart = now;
  let status: SubscriptionStatus = 'active';

  const trialDays = input.trial_period_days ?? plan.trial_period_days;
  
  if (input.trial_end) {
    trialStart = now;
    trialEnd = new Date(input.trial_end);
    if (trialEnd <= now) {
      throw new ValidationError('trial_end must be in the future');
    }
    periodStart = trialEnd;
    status = 'trialing';
  } else if (trialDays > 0) {
    trialStart = now;
    trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    periodStart = trialEnd;
    status = 'trialing';
  }

  const periodEnd = calculatePeriodEnd(
    periodStart,
    plan.billing_interval,
    plan.billing_interval_count
  );

  // Create subscription item
  const items: SubscriptionItem[] = [{
    id: uuidv4(),
    plan_id: plan.id,
    price_id: price.id,
    quantity: input.quantity || 1,
  }];

  const id = uuidv4();
  const result = await db.query(
    `INSERT INTO subscriptions (
      id, application_id, customer_id, external_id, status,
      items, currency, current_period_start, current_period_end,
      trial_start, trial_end, billing_cycle_anchor,
      cancel_at_period_end, metadata, test_mode,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
    RETURNING *`,
    [
      id,
      applicationId,
      input.customer_id,
      input.external_id || null,
      status,
      JSON.stringify(items),
      currency,
      status === 'trialing' ? now : periodStart,
      status === 'trialing' ? trialEnd : periodEnd,
      trialStart,
      trialEnd,
      billingAnchor,
      false,
      JSON.stringify(input.metadata || {}),
      testMode,
    ]
  );

  logger.info('Subscription created', {
    subscriptionId: id,
    customerId: input.customer_id,
    planId: plan.id,
    status,
    testMode,
  });

  return formatSubscription(result.rows[0]);
}

/**
 * Get subscription by ID
 */
export async function getById(
  applicationId: string,
  subscriptionId: string,
  testMode: boolean
): Promise<Subscription> {
  const result = await db.query(
    `SELECT * FROM subscriptions 
     WHERE id = $1 AND application_id = $2 AND test_mode = $3`,
    [subscriptionId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Subscription not found');
  }

  return formatSubscription(result.rows[0]);
}

/**
 * Get subscription by external ID
 */
export async function getByExternalId(
  applicationId: string,
  externalId: string,
  testMode: boolean
): Promise<Subscription> {
  const result = await db.query(
    `SELECT * FROM subscriptions 
     WHERE external_id = $1 AND application_id = $2 AND test_mode = $3`,
    [externalId, applicationId, testMode]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Subscription not found');
  }

  return formatSubscription(result.rows[0]);
}

/**
 * Update subscription
 */
export async function update(
  applicationId: string,
  subscriptionId: string,
  testMode: boolean,
  input: UpdateSubscriptionInput
): Promise<Subscription> {
  const existing = await getById(applicationId, subscriptionId, testMode);

  if (existing.status === 'canceled') {
    throw new ValidationError('Cannot update canceled subscription');
  }

  // Check external_id uniqueness
  if (input.external_id && input.external_id !== existing.external_id) {
    const duplicate = await db.query(
      `SELECT id FROM subscriptions 
       WHERE application_id = $1 AND external_id = $2 AND test_mode = $3 AND id != $4`,
      [applicationId, input.external_id, testMode, subscriptionId]
    );
    if (duplicate.rows.length > 0) {
      throw new ConflictError(`Subscription with external_id '${input.external_id}' already exists`);
    }
  }

  // Build update query
  const updates: string[] = ['updated_at = NOW()'];
  const values: any[] = [];
  let paramIndex = 1;

  if (input.external_id !== undefined) {
    updates.push(`external_id = $${paramIndex}`);
    values.push(input.external_id);
    paramIndex++;
  }

  if (input.quantity !== undefined) {
    // Update quantity in items
    const items = existing.items.map((item) => ({
      ...item,
      quantity: input.quantity,
    }));
    updates.push(`items = $${paramIndex}`);
    values.push(JSON.stringify(items));
    paramIndex++;
  }

  if (input.metadata !== undefined) {
    updates.push(`metadata = $${paramIndex}`);
    values.push(JSON.stringify(input.metadata));
    paramIndex++;
  }

  values.push(subscriptionId, applicationId, testMode);

  const result = await db.query(
    `UPDATE subscriptions SET ${updates.join(', ')}
     WHERE id = $${paramIndex} AND application_id = $${paramIndex + 1} AND test_mode = $${paramIndex + 2}
     RETURNING *`,
    values
  );

  logger.info('Subscription updated', { subscriptionId, applicationId });
  return formatSubscription(result.rows[0]);
}

/**
 * Change subscription plan (upgrade/downgrade)
 */
export async function changePlan(
  applicationId: string,
  subscriptionId: string,
  testMode: boolean,
  newPlanId: string,
  options: {
    prorate?: boolean;
    immediate?: boolean;
  } = {}
): Promise<Subscription> {
  const existing = await getById(applicationId, subscriptionId, testMode);

  if (!['active', 'trialing'].includes(existing.status)) {
    throw new ValidationError('Can only change plan for active or trialing subscriptions');
  }

  // Validate new plan
  const newPlan = await planService.getById(applicationId, newPlanId, testMode);
  if (newPlan.status !== 'active') {
    throw new ValidationError('Cannot change to inactive plan');
  }

  // Get price for current currency
  const price = planService.getPriceForCurrency(newPlan, existing.currency);
  if (!price) {
    throw new ValidationError(`New plan does not support currency: ${existing.currency}`);
  }

  // Update items with new plan
  const items: SubscriptionItem[] = [{
    id: existing.items[0]?.id || uuidv4(),
    plan_id: newPlan.id,
    price_id: price.id,
    quantity: existing.items[0]?.quantity || 1,
  }];

  // If immediate, recalculate period
  let periodStart = existing.current_period_start;
  let periodEnd = existing.current_period_end;

  if (options.immediate) {
    periodStart = new Date();
    periodEnd = calculatePeriodEnd(
      periodStart,
      newPlan.billing_interval,
      newPlan.billing_interval_count
    );
  }

  const result = await db.query(
    `UPDATE subscriptions SET
      items = $1,
      current_period_start = $2,
      current_period_end = $3,
      updated_at = NOW()
     WHERE id = $4 AND application_id = $5 AND test_mode = $6
     RETURNING *`,
    [
      JSON.stringify(items),
      periodStart,
      periodEnd,
      subscriptionId,
      applicationId,
      testMode,
    ]
  );

  logger.info('Subscription plan changed', {
    subscriptionId,
    oldPlanId: existing.items[0]?.plan_id,
    newPlanId,
    immediate: options.immediate,
  });

  return formatSubscription(result.rows[0]);
}

/**
 * Cancel subscription
 */
export async function cancel(
  applicationId: string,
  subscriptionId: string,
  testMode: boolean,
  options: {
    at_period_end?: boolean;
    reason?: CancellationReason;
  } = {}
): Promise<Subscription> {
  const existing = await getById(applicationId, subscriptionId, testMode);

  if (existing.status === 'canceled') {
    throw new ValidationError('Subscription is already canceled');
  }

  const atPeriodEnd = options.at_period_end ?? true;
  const now = new Date();

  let updateQuery: string;
  let values: any[];

  if (atPeriodEnd) {
    // Cancel at end of current period
    updateQuery = `
      UPDATE subscriptions SET
        cancel_at_period_end = true,
        cancel_at = $1,
        cancellation_reason = $2,
        updated_at = NOW()
      WHERE id = $3 AND application_id = $4 AND test_mode = $5
      RETURNING *
    `;
    values = [
      existing.current_period_end,
      options.reason || 'customer_request',
      subscriptionId,
      applicationId,
      testMode,
    ];
  } else {
    // Cancel immediately
    updateQuery = `
      UPDATE subscriptions SET
        status = 'canceled',
        canceled_at = $1,
        cancel_at = $1,
        cancellation_reason = $2,
        updated_at = NOW()
      WHERE id = $3 AND application_id = $4 AND test_mode = $5
      RETURNING *
    `;
    values = [
      now,
      options.reason || 'customer_request',
      subscriptionId,
      applicationId,
      testMode,
    ];
  }

  const result = await db.query(updateQuery, values);

  logger.info('Subscription canceled', {
    subscriptionId,
    atPeriodEnd,
    reason: options.reason,
  });

  return formatSubscription(result.rows[0]);
}

/**
 * Reactivate a canceled subscription (if cancel_at_period_end was true and period hasn't ended)
 */
export async function reactivate(
  applicationId: string,
  subscriptionId: string,
  testMode: boolean
): Promise<Subscription> {
  const existing = await getById(applicationId, subscriptionId, testMode);

  if (existing.status === 'canceled') {
    throw new ValidationError('Cannot reactivate fully canceled subscription');
  }

  if (!existing.cancel_at_period_end) {
    throw new ValidationError('Subscription is not pending cancellation');
  }

  const result = await db.query(
    `UPDATE subscriptions SET
      cancel_at_period_end = false,
      cancel_at = NULL,
      cancellation_reason = NULL,
      updated_at = NOW()
     WHERE id = $1 AND application_id = $2 AND test_mode = $3
     RETURNING *`,
    [subscriptionId, applicationId, testMode]
  );

  logger.info('Subscription reactivated', { subscriptionId });
  return formatSubscription(result.rows[0]);
}

/**
 * Pause subscription
 */
export async function pause(
  applicationId: string,
  subscriptionId: string,
  testMode: boolean,
  options: {
    resume_at?: Date;
  } = {}
): Promise<Subscription> {
  const existing = await getById(applicationId, subscriptionId, testMode);

  if (existing.status !== 'active') {
    throw new ValidationError('Can only pause active subscriptions');
  }

  const now = new Date();
  const resumeAt = options.resume_at || null;

  if (resumeAt && resumeAt <= now) {
    throw new ValidationError('resume_at must be in the future');
  }

  const result = await db.query(
    `UPDATE subscriptions SET
      status = 'paused',
      pause_start = $1,
      pause_end = $2,
      updated_at = NOW()
     WHERE id = $3 AND application_id = $4 AND test_mode = $5
     RETURNING *`,
    [now, resumeAt, subscriptionId, applicationId, testMode]
  );

  logger.info('Subscription paused', { subscriptionId, resumeAt });
  return formatSubscription(result.rows[0]);
}

/**
 * Resume paused subscription
 */
export async function resume(
  applicationId: string,
  subscriptionId: string,
  testMode: boolean
): Promise<Subscription> {
  const existing = await getById(applicationId, subscriptionId, testMode);

  if (existing.status !== 'paused') {
    throw new ValidationError('Subscription is not paused');
  }

  // Calculate new period dates from now
  const plan = await planService.getById(
    applicationId,
    existing.items[0].plan_id,
    testMode,
    true
  );

  const now = new Date();
  const periodEnd = calculatePeriodEnd(
    now,
    plan.billing_interval,
    plan.billing_interval_count
  );

  const result = await db.query(
    `UPDATE subscriptions SET
      status = 'active',
      pause_start = NULL,
      pause_end = NULL,
      current_period_start = $1,
      current_period_end = $2,
      updated_at = NOW()
     WHERE id = $3 AND application_id = $4 AND test_mode = $5
     RETURNING *`,
    [now, periodEnd, subscriptionId, applicationId, testMode]
  );

  logger.info('Subscription resumed', { subscriptionId });
  return formatSubscription(result.rows[0]);
}

/**
 * List subscriptions with cursor pagination
 */
export async function list(params: ListSubscriptionsParams): Promise<ListSubscriptionsResult> {
  const {
    application_id,
    test_mode,
    customer_id,
    plan_id,
    status,
    limit = 10,
    starting_after,
  } = params;

  const safeLimit = Math.min(Math.max(1, limit), 100);
  const conditions: string[] = ['application_id = $1', 'test_mode = $2'];
  const values: any[] = [application_id, test_mode];
  let paramIndex = 3;

  if (customer_id) {
    conditions.push(`customer_id = $${paramIndex}`);
    values.push(customer_id);
    paramIndex++;
  }

  if (plan_id) {
    conditions.push(`items @> $${paramIndex}::jsonb`);
    values.push(JSON.stringify([{ plan_id }]));
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }

  if (starting_after) {
    conditions.push(`created_at < (SELECT created_at FROM subscriptions WHERE id = $${paramIndex})`);
    values.push(starting_after);
    paramIndex++;
  }

  values.push(safeLimit + 1);

  const result = await db.query(
    `SELECT * FROM subscriptions
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${paramIndex}`,
    values
  );

  const hasMore = result.rows.length > safeLimit;
  const data = result.rows.slice(0, safeLimit).map(formatSubscription);

  return { data, has_more: hasMore };
}

/**
 * Get subscriptions for a customer
 */
export async function getCustomerSubscriptions(
  applicationId: string,
  customerId: string,
  testMode: boolean,
  options: { status?: SubscriptionStatus } = {}
): Promise<Subscription[]> {
  const conditions = ['application_id = $1', 'customer_id = $2', 'test_mode = $3'];
  const values: any[] = [applicationId, customerId, testMode];

  if (options.status) {
    conditions.push('status = $4');
    values.push(options.status);
  }

  const result = await db.query(
    `SELECT * FROM subscriptions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    values
  );

  return result.rows.map(formatSubscription);
}

/**
 * Process trial ending (called by scheduler)
 */
export async function activateTrialEnding(
  subscriptionId: string
): Promise<Subscription | null> {
  const result = await db.query(
    `UPDATE subscriptions SET
      status = 'active',
      current_period_start = trial_end,
      current_period_end = trial_end + (
        SELECT 
          CASE billing_interval
            WHEN 'day' THEN interval '1 day' * billing_interval_count
            WHEN 'week' THEN interval '1 week' * billing_interval_count  
            WHEN 'month' THEN interval '1 month' * billing_interval_count
            WHEN 'year' THEN interval '1 year' * billing_interval_count
          END
        FROM plans WHERE id = (items->0->>'plan_id')::uuid
      ),
      updated_at = NOW()
     WHERE id = $1 AND status = 'trialing' AND trial_end <= NOW()
     RETURNING *`,
    [subscriptionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  logger.info('Subscription activated from trial', { subscriptionId });
  return formatSubscription(result.rows[0]);
}

export default {
  create,
  getById,
  getByExternalId,
  update,
  changePlan,
  cancel,
  reactivate,
  pause,
  resume,
  list,
  getCustomerSubscriptions,
  activateTrialEnding,
};
```

---

## Step 2: Create src/routes/subscriptions.routes.ts

Create this file:

```typescript
/**
 * Subscription Routes
 * RESTful endpoints for subscription management
 */

import { Router, Request, Response } from 'express';
import subscriptionService from '../services/subscriptionService';
import { authenticate, requireSecretKey } from '../middleware/authenticate';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

const router = Router();

// Apply authentication and rate limiting to all routes
router.use(authenticate);
router.use(apiRateLimiter);

/**
 * POST /v1/subscriptions
 * Create a new subscription
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.create(
      req.auth!.application_id,
      req.auth!.test_mode,
      req.body,
      req.auth!.default_currency
    );

    res.status(201).json({ data: subscription });
  })
);

/**
 * GET /v1/subscriptions
 * List subscriptions with pagination
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await subscriptionService.list({
      application_id: req.auth!.application_id,
      test_mode: req.auth!.test_mode,
      customer_id: req.query.customer_id as string,
      plan_id: req.query.plan_id as string,
      status: req.query.status as any,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
      starting_after: req.query.starting_after as string,
    });

    res.json(result);
  })
);

/**
 * GET /v1/subscriptions/:id
 * Get subscription by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.getById(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode
    );

    res.json({ data: subscription });
  })
);

/**
 * GET /v1/subscriptions/external/:external_id
 * Get subscription by external ID
 */
router.get(
  '/external/:external_id',
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.getByExternalId(
      req.auth!.application_id,
      req.params.external_id,
      req.auth!.test_mode
    );

    res.json({ data: subscription });
  })
);

/**
 * PATCH /v1/subscriptions/:id
 * Update subscription
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.update(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.body
    );

    res.json({ data: subscription });
  })
);

/**
 * POST /v1/subscriptions/:id/change-plan
 * Change subscription plan (upgrade/downgrade)
 */
router.post(
  '/:id/change-plan',
  asyncHandler(async (req: Request, res: Response) => {
    const { plan_id, prorate, immediate } = req.body;

    if (!plan_id) {
      throw new ValidationError('plan_id is required');
    }

    const subscription = await subscriptionService.changePlan(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      plan_id,
      { prorate, immediate }
    );

    res.json({ data: subscription });
  })
);

/**
 * POST /v1/subscriptions/:id/cancel
 * Cancel subscription
 */
router.post(
  '/:id/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const { at_period_end, reason } = req.body;

    const subscription = await subscriptionService.cancel(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      { at_period_end, reason }
    );

    res.json({ data: subscription });
  })
);

/**
 * POST /v1/subscriptions/:id/reactivate
 * Reactivate a subscription pending cancellation
 */
router.post(
  '/:id/reactivate',
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.reactivate(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode
    );

    res.json({ data: subscription });
  })
);

/**
 * POST /v1/subscriptions/:id/pause
 * Pause subscription
 */
router.post(
  '/:id/pause',
  asyncHandler(async (req: Request, res: Response) => {
    const { resume_at } = req.body;

    const subscription = await subscriptionService.pause(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      { resume_at: resume_at ? new Date(resume_at) : undefined }
    );

    res.json({ data: subscription });
  })
);

/**
 * POST /v1/subscriptions/:id/resume
 * Resume paused subscription
 */
router.post(
  '/:id/resume',
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.resume(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode
    );

    res.json({ data: subscription });
  })
);

/**
 * DELETE /v1/subscriptions/:id
 * Cancel subscription immediately (alias for cancel with at_period_end=false)
 */
router.delete(
  '/:id',
  requireSecretKey,
  asyncHandler(async (req: Request, res: Response) => {
    const subscription = await subscriptionService.cancel(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      { at_period_end: false, reason: 'customer_request' }
    );

    res.json({ data: subscription, deleted: true });
  })
);

export default router;
```

---

## Step 3: Create Database Migration (if subscriptions table doesn't exist)

If needed, create `database/migrations/018_create_subscriptions.sql`:

```sql
-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' 
    CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid', 'incomplete')),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  cancel_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason VARCHAR(50),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  pause_start TIMESTAMP WITH TIME ZONE,
  pause_end TIMESTAMP WITH TIME ZONE,
  billing_cycle_anchor TIMESTAMP WITH TIME ZONE NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  test_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_subscription_external_id UNIQUE (application_id, external_id, test_mode)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_application_id ON subscriptions(application_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_test_mode ON subscriptions(test_mode);
CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end ON subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON subscriptions(trial_end) WHERE trial_end IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions(created_at DESC);
```

---

## Step 4: Update src/app.ts

Add these lines to your existing app.ts:

**Add import at top:**
```typescript
import subscriptionsRoutes from './routes/subscriptions.routes';
```

**Add route registration:**
```typescript
app.use('/v1/subscriptions', subscriptionsRoutes);
```

Your routes section should now look like:
```typescript
// Routes
app.use('/health', healthRoutes);
app.use('/v1/customers', customersRoutes);
app.use('/v1/plans', plansRoutes);
app.use('/v1/subscriptions', subscriptionsRoutes);
```

---

## Step 5: Verify Implementation

Build and check for errors:

```bash
npm run build
```

---

## Step 6: Testing

Start the server:
```bash
npm run dev
```

### Create Subscription:
```bash
curl -X POST http://localhost:3000/v1/subscriptions \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUSTOMER_UUID",
    "plan_id": "PLAN_UUID",
    "currency": "NGN"
  }'
```

### Create with Trial:
```bash
curl -X POST http://localhost:3000/v1/subscriptions \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "CUSTOMER_UUID",
    "plan_id": "PLAN_UUID",
    "trial_period_days": 14
  }'
```

### List Subscriptions:
```bash
# All subscriptions
curl http://localhost:3000/v1/subscriptions \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY"

# Filter by customer
curl "http://localhost:3000/v1/subscriptions?customer_id=CUSTOMER_UUID" \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY"

# Filter by status
curl "http://localhost:3000/v1/subscriptions?status=active" \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY"
```

### Change Plan (Upgrade/Downgrade):
```bash
curl -X POST http://localhost:3000/v1/subscriptions/{subscription_id}/change-plan \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": "NEW_PLAN_UUID",
    "immediate": true
  }'
```

### Cancel at Period End:
```bash
curl -X POST http://localhost:3000/v1/subscriptions/{subscription_id}/cancel \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "at_period_end": true,
    "reason": "customer_request"
  }'
```

### Cancel Immediately:
```bash
curl -X DELETE http://localhost:3000/v1/subscriptions/{subscription_id} \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY"
```

### Reactivate (undo pending cancellation):
```bash
curl -X POST http://localhost:3000/v1/subscriptions/{subscription_id}/reactivate \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY"
```

### Pause Subscription:
```bash
curl -X POST http://localhost:3000/v1/subscriptions/{subscription_id}/pause \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "resume_at": "2025-03-01T00:00:00Z"
  }'
```

### Resume Subscription:
```bash
curl -X POST http://localhost:3000/v1/subscriptions/{subscription_id}/resume \
  -H "Authorization: Bearer xbs_sk_test_YOUR_KEY"
```

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /v1/subscriptions | Create subscription |
| GET | /v1/subscriptions | List subscriptions |
| GET | /v1/subscriptions/:id | Get by ID |
| GET | /v1/subscriptions/external/:external_id | Get by external ID |
| PATCH | /v1/subscriptions/:id | Update subscription |
| POST | /v1/subscriptions/:id/change-plan | Upgrade/downgrade |
| POST | /v1/subscriptions/:id/cancel | Cancel subscription |
| POST | /v1/subscriptions/:id/reactivate | Undo cancellation |
| POST | /v1/subscriptions/:id/pause | Pause billing |
| POST | /v1/subscriptions/:id/resume | Resume billing |
| DELETE | /v1/subscriptions/:id | Cancel immediately |

### Subscription Statuses

| Status | Description |
|--------|-------------|
| trialing | In free trial period |
| active | Actively billing |
| past_due | Payment failed, retrying |
| paused | Temporarily paused |
| canceled | Permanently canceled |
| unpaid | Payment failed, exhausted retries |
| incomplete | Initial payment pending |

### Cancellation Reasons

| Reason | Description |
|--------|-------------|
| customer_request | Customer asked to cancel |
| payment_failure | Failed to collect payment |
| plan_change | Switching to different plan |
| fraud | Fraudulent activity detected |
| other | Other reason |

---

## Summary

You have implemented:
- **Section 2.3**: Subscription management with trials, upgrades, downgrades, pause/resume, and cancellation

**Progress so far:**
- ✅ 1.3 Authentication
- ✅ 2.1 Customers
- ✅ 2.2 Plans
- ✅ 2.3 Subscriptions

**Next section:** 3.1 Invoice Generation - Automatic invoice creation for subscriptions
