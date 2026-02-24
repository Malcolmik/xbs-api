/**
 * Plan Routes
 * RESTful endpoints for plan management
 */

import { Router, Request, Response } from 'express';
import planService from '../services/planService';
import { authenticate } from '../middleware/authenticate';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

const router = Router();

// Apply authentication and rate limiting to all routes
router.use(authenticate);
router.use(apiRateLimiter);

/**
 * POST /v1/plans
 * Create a new plan
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await planService.create(
      req.auth!.application_id,
      req.auth!.test_mode,
      req.body
    );
    res.status(201).json({ data: plan });
  })
);

/**
 * GET /v1/plans
 * List plans with pagination
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await planService.list({
      application_id: req.auth!.application_id,
      test_mode: req.auth!.test_mode,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
      starting_after: req.query.starting_after as string,
      status: req.query.status as any,
      include_archived: req.query.include_archived === 'true',
    });
    res.json(result);
  })
);

/**
 * GET /v1/plans/external/:external_id
 * Get plan by external ID — registered before /:id to avoid route conflict
 */
router.get(
  '/external/:external_id',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await planService.getByExternalId(
      req.auth!.application_id,
      req.params.external_id,
      req.auth!.test_mode,
      req.query.include_archived === 'true'
    );
    res.json({ data: plan });
  })
);

/**
 * GET /v1/plans/:id
 * Get plan by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await planService.getById(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.query.include_archived === 'true'
    );
    res.json({ data: plan });
  })
);

/**
 * PATCH /v1/plans/:id
 * Update plan (limited fields)
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await planService.update(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.body
    );
    res.json({ data: plan });
  })
);

/**
 * PUT /v1/plans/:id
 * Update plan (same as PATCH)
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await planService.update(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.body
    );
    res.json({ data: plan });
  })
);

/**
 * POST /v1/plans/:id/archive
 * Archive plan
 */
router.post(
  '/:id/archive',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await planService.archive(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode
    );
    res.json({ data: plan });
  })
);

/**
 * POST /v1/plans/:id/unarchive
 * Unarchive plan
 */
router.post(
  '/:id/unarchive',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await planService.unarchive(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode
    );
    res.json({ data: plan });
  })
);

/**
 * POST /v1/plans/:id/clone
 * Clone a plan
 */
router.post(
  '/:id/clone',
  asyncHandler(async (req: Request, res: Response) => {
    const plan = await planService.clone(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode,
      req.body
    );
    res.status(201).json({ data: plan });
  })
);

/**
 * POST /v1/plans/:id/calculate
 * Calculate price for quantity
 */
router.post(
  '/:id/calculate',
  asyncHandler(async (req: Request, res: Response) => {
    const { currency, quantity = 1 } = req.body;

    if (!currency) {
      throw new ValidationError('currency is required');
    }

    const plan = await planService.getById(
      req.auth!.application_id,
      req.params.id,
      req.auth!.test_mode
    );

    const price = planService.getPriceForCurrency(plan, currency);
    if (!price) {
      throw new ValidationError(`No price found for currency: ${currency}`);
    }

    const amount = planService.calculatePrice(price, quantity);

    res.json({
      data: {
        plan_id: plan.id,
        currency: price.currency,
        quantity,
        unit_amount: price.unit_amount,
        total_amount: amount,
        pricing_model: price.pricing_model,
      },
    });
  })
);

export default router;
