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
  external_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  country: string | null;
  tax_id: string | null;
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
  country?: string;
  tax_id?: string;
  metadata?: Record<string, any>;
}

export interface UpdateCustomerInput {
  email?: string;
  external_id?: string;
  name?: string;
  phone?: string;
  country?: string;
  tax_id?: string;
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

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatCustomer(row: any): Customer {
  return {
    id: row.id,
    object: 'customer',
    application_id: row.application_id,
    external_id: row.external_id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    country: row.country,
    tax_id: row.tax_id,
    metadata: row.metadata || {},
    test_mode: row.test_mode,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

export async function create(
  applicationId: string,
  testMode: boolean,
  input: CreateCustomerInput
): Promise<Customer> {
  if (!input.email || !validateEmail(input.email)) {
    throw new ValidationError('Valid email is required');
  }

  // external_id is NOT NULL in DB — generate one if not provided
  const externalId = input.external_id || uuidv4();

  // Check for duplicate external_id
  const existing = await db.query(
    `SELECT id FROM customers
     WHERE application_id = $1 AND external_id = $2 AND test_mode = $3 AND deleted_at IS NULL`,
    [applicationId, externalId, testMode]
  );
  if (existing.rows.length > 0) {
    throw new ConflictError(`Customer with external_id '${externalId}' already exists`);
  }

  const id = uuidv4();
  const result = await db.query(
    `INSERT INTO customers (
      id, application_id, external_id, email, name, phone,
      country, tax_id, metadata, test_mode
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      id,
      applicationId,
      externalId,
      input.email,
      input.name || null,
      input.phone || null,
      input.country || null,
      input.tax_id || null,
      JSON.stringify(input.metadata || {}),
      testMode,
    ]
  );

  logger.info('Customer created', { customerId: id, applicationId, testMode });
  return formatCustomer(result.rows[0]);
}

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

export async function update(
  applicationId: string,
  customerId: string,
  testMode: boolean,
  input: UpdateCustomerInput
): Promise<Customer> {
  await getById(applicationId, customerId, testMode);

  if (input.email && !validateEmail(input.email)) {
    throw new ValidationError('Invalid email format');
  }

  if (input.external_id) {
    const conflict = await db.query(
      `SELECT id FROM customers
       WHERE application_id = $1 AND external_id = $2 AND test_mode = $3
         AND id != $4 AND deleted_at IS NULL`,
      [applicationId, input.external_id, testMode, customerId]
    );
    if (conflict.rows.length > 0) {
      throw new ConflictError(`Customer with external_id '${input.external_id}' already exists`);
    }
  }

  const updates: string[] = ['updated_at = NOW()'];
  const values: any[] = [];
  let paramIndex = 1;

  const fields: (keyof UpdateCustomerInput)[] = [
    'email', 'external_id', 'name', 'phone', 'country', 'tax_id', 'metadata',
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

export async function deleteCustomer(
  applicationId: string,
  customerId: string,
  testMode: boolean
): Promise<Customer> {
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
    conditions.push(
      `created_at < (SELECT created_at FROM customers WHERE id = $${paramIndex})`
    );
    values.push(starting_after);
    paramIndex++;
  }

  values.push(safeLimit + 1);

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
  mergeMetadata,
};
