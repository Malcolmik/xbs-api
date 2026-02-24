-- Seed Data: Sample Applications
-- Description: Create test applications for development

-- Sample Application 1: TaskFlow (Project Management SaaS)
INSERT INTO applications (
  id,
  name,
  email,
  password_hash,
  webhook_url,
  webhook_secret,
  default_currency,
  timezone,
  analytics_currency,
  active
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'TaskFlow',
  'dev@taskflow.app',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- "password123"
  'https://api.taskflow.app/webhooks/xbs',
  'whsec_taskflow_test_secret_key',
  'USD',
  'America/New_York',
  'USD',
  true
);

-- Sample Application 2: PayServe (Fintech SaaS - Nigeria)
INSERT INTO applications (
  id,
  name,
  email,
  password_hash,
  webhook_url,
  webhook_secret,
  default_currency,
  timezone,
  analytics_currency,
  active
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  'PayServe',
  'dev@payserve.ng',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- "password123"
  'https://api.payserve.ng/webhooks/xbs',
  'whsec_payserve_test_secret_key',
  'NGN',
  'Africa/Lagos',
  'USD',
  true
);

-- Sample Application 3: EduPro (EdTech - Kenya)
INSERT INTO applications (
  id,
  name,
  email,
  password_hash,
  webhook_url,
  webhook_secret,
  default_currency,
  timezone,
  analytics_currency,
  active
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  'EduPro',
  'dev@edupro.co.ke',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- "password123"
  'https://api.edupro.co.ke/webhooks/xbs',
  'whsec_edupro_test_secret_key',
  'KES',
  'Africa/Nairobi',
  'USD',
  true
);

-- Generate API keys for each application
-- TaskFlow API Keys
INSERT INTO api_keys (application_id, key_prefix, key_hash, key_type, key_role, name, active) VALUES
  ('11111111-1111-1111-1111-111111111111', 'xbs_pk_test_', '$2a$10$test_publishable_taskflow', 'test', 'publishable', 'TaskFlow Test Publishable', true),
  ('11111111-1111-1111-1111-111111111111', 'xbs_sk_test_', '$2a$10$test_secret_taskflow', 'test', 'secret', 'TaskFlow Test Secret', true),
  ('11111111-1111-1111-1111-111111111111', 'xbs_pk_live_', '$2a$10$live_publishable_taskflow', 'live', 'publishable', 'TaskFlow Live Publishable', true),
  ('11111111-1111-1111-1111-111111111111', 'xbs_sk_live_', '$2a$10$live_secret_taskflow', 'live', 'secret', 'TaskFlow Live Secret', true);

-- PayServe API Keys
INSERT INTO api_keys (application_id, key_prefix, key_hash, key_type, key_role, name, active) VALUES
  ('22222222-2222-2222-2222-222222222222', 'xbs_pk_test_', '$2a$10$test_publishable_payserve', 'test', 'publishable', 'PayServe Test Publishable', true),
  ('22222222-2222-2222-2222-222222222222', 'xbs_sk_test_', '$2a$10$test_secret_payserve', 'test', 'secret', 'PayServe Test Secret', true),
  ('22222222-2222-2222-2222-222222222222', 'xbs_pk_live_', '$2a$10$live_publishable_payserve', 'live', 'publishable', 'PayServe Live Publishable', true),
  ('22222222-2222-2222-2222-222222222222', 'xbs_sk_live_', '$2a$10$live_secret_payserve', 'live', 'secret', 'PayServe Live Secret', true);

-- EduPro API Keys
INSERT INTO api_keys (application_id, key_prefix, key_hash, key_type, key_role, name, active) VALUES
  ('33333333-3333-3333-3333-333333333333', 'xbs_pk_test_', '$2a$10$test_publishable_edupro', 'test', 'publishable', 'EduPro Test Publishable', true),
  ('33333333-3333-3333-3333-333333333333', 'xbs_sk_test_', '$2a$10$test_secret_edupro', 'test', 'secret', 'EduPro Test Secret', true),
  ('33333333-3333-3333-3333-333333333333', 'xbs_pk_live_', '$2a$10$live_publishable_edupro', 'live', 'publishable', 'EduPro Live Publishable', true),
  ('33333333-3333-3333-3333-333333333333', 'xbs_sk_live_', '$2a$10$live_secret_edupro', 'live', 'secret', 'EduPro Live Secret', true);

-- Create XBS subscriptions for each application (all start on free tier)
INSERT INTO xbs_subscriptions (application_id, plan_type, monthly_fee_cents, included_transactions, overage_fee_cents, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'free', 0, 100, 1, 'active'),
  ('22222222-2222-2222-2222-222222222222', 'free', 0, 100, 1, 'active'),
  ('33333333-3333-3333-3333-333333333333', 'free', 0, 100, 1, 'active');

-- Note: In production, API keys would be actual secure random strings
-- The hashes above are placeholders for demonstration
