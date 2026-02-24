-- Seed Data: Sample Subscription Plans
-- Description: Create sample plans for each test application

-- TaskFlow Plans (USD pricing)
INSERT INTO subscription_plans (
  application_id, plan_code, name, description, price_cents, currency, 
  billing_interval, trial_days, features, usage_pricing, active
) VALUES
  -- Free Plan
  (
    '11111111-1111-1111-1111-111111111111',
    'free',
    'Free',
    'Perfect for individuals getting started',
    0,
    'USD',
    'monthly',
    0,
    '{"projects": 5, "users": 1, "storage_gb": 1, "support": "community"}',
    '{}',
    true
  ),
  -- Starter Plan
  (
    '11111111-1111-1111-1111-111111111111',
    'starter',
    'Starter',
    'For small teams',
    2000, -- $20.00
    'USD',
    'monthly',
    14,
    '{"projects": 25, "users": 5, "storage_gb": 10, "support": "email"}',
    '{}',
    true
  ),
  -- Pro Plan with Usage-Based Storage
  (
    '11111111-1111-1111-1111-111111111111',
    'pro',
    'Pro',
    'For growing teams',
    5000, -- $50.00
    'USD',
    'monthly',
    14,
    '{"projects": "unlimited", "users": 20, "storage_gb": 50, "support": "priority"}',
    '{
      "storage_gb": {
        "tiers": [
          {"up_to": 50, "unit_price_cents": 0},
          {"up_to": 100, "unit_price_cents": 50},
          {"up_to": null, "unit_price_cents": 30}
        ]
      }
    }',
    true
  );

-- PayServe Plans (NGN pricing)
INSERT INTO subscription_plans (
  application_id, plan_code, name, description, price_cents, currency,
  billing_interval, trial_days, features, usage_pricing, active
) VALUES
  -- Basic Plan
  (
    '22222222-2222-2222-2222-222222222222',
    'basic',
    'Basic',
    'For small businesses',
    1500000, -- ₦15,000
    'NGN',
    'monthly',
    7,
    '{"transactions_limit": 100, "accounts": 1, "api_access": false}',
    '{}',
    true
  ),
  -- Business Plan with Transaction Fees
  (
    '22222222-2222-2222-2222-222222222222',
    'business',
    'Business',
    'For growing businesses',
    5000000, -- ₦50,000
    'NGN',
    'monthly',
    14,
    '{"transactions_limit": 1000, "accounts": 5, "api_access": true}',
    '{
      "transactions": {
        "tiers": [
          {"up_to": 1000, "unit_price_cents": 0},
          {"up_to": 5000, "unit_price_cents": 10},
          {"up_to": null, "unit_price_cents": 5}
        ],
        "minimum_charge_cents": 0
      }
    }',
    true
  ),
  -- Enterprise Plan
  (
    '22222222-2222-2222-2222-222222222222',
    'enterprise',
    'Enterprise',
    'For large organizations',
    15000000, -- ₦150,000
    'NGN',
    'monthly',
    30,
    '{"transactions_limit": "unlimited", "accounts": "unlimited", "api_access": true, "dedicated_support": true}',
    '{}',
    true
  );

-- EduPro Plans (KES pricing)
INSERT INTO subscription_plans (
  application_id, plan_code, name, description, price_cents, currency,
  billing_interval, trial_days, features, usage_pricing, active
) VALUES
  -- Individual Educator
  (
    '33333333-3333-3333-3333-333333333333',
    'educator',
    'Educator',
    'For individual teachers',
    200000, -- KSh 2,000
    'KES',
    'monthly',
    14,
    '{"students": 30, "courses": 5, "storage_gb": 5}',
    '{}',
    true
  ),
  -- Institution Plan with Per-Student Pricing
  (
    '33333333-3333-3333-3333-333333333333',
    'institution',
    'Institution',
    'For schools and institutions',
    1000000, -- KSh 10,000 base
    'KES',
    'monthly',
    30,
    '{"students": 100, "courses": "unlimited", "storage_gb": 100, "teachers": 10}',
    '{
      "students": {
        "tiers": [
          {"up_to": 100, "unit_price_cents": 0},
          {"up_to": 500, "unit_price_cents": 5000},
          {"up_to": null, "unit_price_cents": 3000}
        ],
        "minimum_charge_cents": 0
      }
    }',
    true
  );

-- Define usage metrics for applications
INSERT INTO usage_metrics (application_id, metric_name, display_name, unit, description) VALUES
  -- TaskFlow metrics
  ('11111111-1111-1111-1111-111111111111', 'storage_gb', 'Storage', 'GB', 'Additional storage beyond plan limit'),
  ('11111111-1111-1111-1111-111111111111', 'api_calls', 'API Calls', 'call', 'Number of API requests'),
  
  -- PayServe metrics
  ('22222222-2222-2222-2222-222222222222', 'transactions', 'Transactions', 'transaction', 'Payment transactions processed'),
  ('22222222-2222-2222-2222-222222222222', 'api_calls', 'API Calls', 'call', 'API requests made'),
  
  -- EduPro metrics
  ('33333333-3333-3333-3333-333333333333', 'students', 'Active Students', 'student', 'Number of active students'),
  ('33333333-3333-3333-3333-333333333333', 'courses', 'Courses', 'course', 'Number of courses created');

-- Insert default dunning configurations
INSERT INTO dunning_configs (
  application_id, retry_schedule, send_emails, suspend_after_attempts, cancel_after_days
) VALUES
  ('11111111-1111-1111-1111-111111111111', ARRAY[1, 3, 5, 7], true, 4, 14),
  ('22222222-2222-2222-2222-222222222222', ARRAY[1, 3, 5, 7], true, 4, 14),
  ('33333333-3333-3333-3333-333333333333', ARRAY[1, 3, 5, 7], true, 4, 14);
