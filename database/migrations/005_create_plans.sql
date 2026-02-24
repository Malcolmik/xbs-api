-- Migration 005: Subscription Plans
-- Description: Pricing plans with tiered usage pricing support

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  
  -- Plan identification
  plan_code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Pricing
  price_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  billing_interval VARCHAR(20) NOT NULL, -- 'monthly', 'yearly'
  trial_days INTEGER DEFAULT 0,
  
  -- Features and limits
  features JSONB DEFAULT '{}'::jsonb,
  
  -- Tiered usage pricing (JSONB)
  -- Example: {
  --   "api_calls": {
  --     "tiers": [
  --       {"up_to": 1000, "unit_price_cents": 1},
  --       {"up_to": 10000, "unit_price_cents": 0.8},
  --       {"up_to": null, "unit_price_cents": 0.5}
  --     ],
  --     "minimum_charge_cents": 500
  --   }
  -- }
  usage_pricing JSONB DEFAULT '{}'::jsonb,
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(application_id, plan_code),
  
  -- Constraints
  CONSTRAINT valid_price CHECK (price_cents >= 0),
  CONSTRAINT valid_trial CHECK (trial_days >= 0),
  CONSTRAINT valid_billing_interval CHECK (billing_interval IN ('monthly', 'yearly')),
  CONSTRAINT valid_currency CHECK (currency ~ '^[A-Z]{3}$')
);

-- Indexes
CREATE INDEX idx_plans_app ON subscription_plans(application_id);
CREATE INDEX idx_plans_active ON subscription_plans(application_id, active);
CREATE INDEX idx_plans_code ON subscription_plans(application_id, plan_code);

-- Trigger
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE subscription_plans IS 'Subscription pricing plans';
COMMENT ON COLUMN subscription_plans.usage_pricing IS 'Tiered pricing for metered usage';
COMMENT ON COLUMN subscription_plans.features IS 'Plan features and limits';
