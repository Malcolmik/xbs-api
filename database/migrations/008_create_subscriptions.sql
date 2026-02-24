-- Migration 008: Subscriptions
-- Description: Active billing relationships between customers and plans

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  
  -- Status
  status subscription_status NOT NULL DEFAULT 'trialing',
  
  -- Billing cycle
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  
  -- Trial
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  
  -- Cancellation
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMP,
  cancellation_reason TEXT,
  
  -- Test mode
  test_mode BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_period CHECK (current_period_end > current_period_start),
  CONSTRAINT valid_trial CHECK (
    (trial_start IS NULL AND trial_end IS NULL) OR
    (trial_start IS NOT NULL AND trial_end IS NOT NULL AND trial_end > trial_start)
  )
);

-- Indexes
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end) 
  WHERE status IN ('active', 'trialing');
CREATE INDEX idx_subscriptions_trial_end ON subscriptions(trial_end)
  WHERE trial_end IS NOT NULL AND status = 'trialing';
CREATE INDEX idx_subscriptions_test ON subscriptions(test_mode);

-- Trigger
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Subscription state changes audit log
CREATE TABLE subscription_state_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  
  from_status subscription_status NOT NULL,
  to_status subscription_status NOT NULL,
  reason TEXT,
  
  changed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_state_changes_subscription ON subscription_state_changes(subscription_id);
CREATE INDEX idx_state_changes_date ON subscription_state_changes(changed_at);

-- Function to log state changes
CREATE OR REPLACE FUNCTION log_subscription_state_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO subscription_state_changes (subscription_id, from_status, to_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_subscription_state_change_trigger
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_subscription_state_change();

-- Comments
COMMENT ON TABLE subscriptions IS 'Active billing relationships';
COMMENT ON COLUMN subscriptions.cancel_at_period_end IS 'Whether to cancel at end of current period';
COMMENT ON TABLE subscription_state_changes IS 'Audit log of subscription status changes';
