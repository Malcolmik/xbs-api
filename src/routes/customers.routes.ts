/**
 * Customer Routes
 * RESTful endpoints for customer management
 */

import { Router, Request, Response } from 'express';
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
      req.body
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
      starting_after: req.query.starting_after as string | undefined,
      email: req.query.email as string | undefined,
      include_deleted: req.query.include_deleted === 'true',
    });
    res.json(result);
  })
);

/**
 * GET /v1/customers/external/:external_id
 * Get customer by external ID — must come before /:id to avoid route conflict
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
 * PATCH /v1/customers/:id
 * Partial update customer
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
 * Full update customer
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
