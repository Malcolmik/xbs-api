-- Migration 009: Usage Records
-- Description: Metered usage tracking with idempotency

CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  
  -- Usage details
  metric_name VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Billing period
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  
  -- Invoice linkage
  invoiced BOOLEAN DEFAULT false,
  invoice_id UUID, -- Will be linked to invoices table later
  
  -- Idempotency (CRITICAL for preventing duplicates)
  idempotency_key VARCHAR(500) UNIQUE NOT NULL,
  
  -- Test mode
  test_mode BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_quantity CHECK (quantity > 0),
  CONSTRAINT valid_period CHECK (period_end > period_start)
);

-- Indexes
CREATE INDEX idx_usage_subscription ON usage_records(subscription_id);
CREATE INDEX idx_usage_metric ON usage_records(subscription_id, metric_name);
CREATE INDEX idx_usage_period ON usage_records(subscription_id, period_start, period_end);
CREATE INDEX idx_usage_uninvoiced ON usage_records(subscription_id, invoiced) 
  WHERE invoiced = false;
CREATE INDEX idx_usage_timestamp ON usage_records(timestamp);
CREATE UNIQUE INDEX idx_usage_idempotency ON usage_records(idempotency_key);
CREATE INDEX idx_usage_test ON usage_records(test_mode);

-- Usage metrics definition table
CREATE TABLE usage_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  
  metric_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  description TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(application_id, metric_name)
);

CREATE INDEX idx_usage_metrics_app ON usage_metrics(application_id);

-- Comments
COMMENT ON TABLE usage_records IS 'Metered usage events';
COMMENT ON COLUMN usage_records.idempotency_key IS 'Prevents duplicate usage recording';
COMMENT ON COLUMN usage_records.invoiced IS 'Whether this usage has been billed';
COMMENT ON TABLE usage_metrics IS 'Application-defined usage metric types';
