-- Migration 016: XBS Own Billing & Analytics
-- Description: XBS bills its own customers (meta-billing) and analytics views

-- ============================================================================
-- XBS OWN BILLING (Meta: XBS bills itself using its own system)
-- ============================================================================

CREATE TABLE xbs_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  
  -- Plan details
  plan_type VARCHAR(50) NOT NULL, -- 'free', 'growth', 'enterprise'
  monthly_fee_cents INTEGER NOT NULL DEFAULT 0,
  included_transactions INTEGER NOT NULL DEFAULT 100,
  overage_fee_cents INTEGER NOT NULL DEFAULT 1, -- $0.01 per transaction
  
  -- Status
  status subscription_status NOT NULL DEFAULT 'active',
  
  -- Billing cycle
  current_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_plan CHECK (plan_type IN ('free', 'growth', 'enterprise'))
);

CREATE INDEX idx_xbs_subs_app ON xbs_subscriptions(application_id);
CREATE INDEX idx_xbs_subs_status ON xbs_subscriptions(status);

CREATE TRIGGER update_xbs_subs_updated_at
  BEFORE UPDATE ON xbs_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- XBS usage tracking (track API calls per application)
CREATE TABLE xbs_usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id),
  
  month DATE NOT NULL,
  api_calls_count INTEGER DEFAULT 0,
  transactions_count INTEGER DEFAULT 0,
  
  UNIQUE(application_id, month)
);

CREATE INDEX idx_xbs_usage_app_month ON xbs_usage_tracking(application_id, month DESC);

-- XBS invoices (XBS bills its customers)
CREATE TABLE xbs_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id),
  
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  amount_due_cents INTEGER NOT NULL,
  status invoice_status NOT NULL DEFAULT 'open',
  
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMP,
  
  line_items JSONB NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_xbs_invoices_app ON xbs_invoices(application_id);
CREATE INDEX idx_xbs_invoices_status ON xbs_invoices(status);
CREATE INDEX idx_xbs_invoices_due ON xbs_invoices(due_date) WHERE status = 'open';

-- ============================================================================
-- ANALYTICS & REPORTING
-- ============================================================================

-- Request logs (observability)
CREATE TABLE request_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Request tracking
  correlation_id UUID NOT NULL,
  application_id UUID REFERENCES applications(id),
  api_key_id UUID REFERENCES api_keys(id),
  
  -- Request details
  method VARCHAR(10) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  
  -- Response details
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  
  -- Error details
  error_code VARCHAR(100),
  error_message TEXT,
  
  -- Client info
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_request_logs_correlation ON request_logs(correlation_id);
CREATE INDEX idx_request_logs_app ON request_logs(application_id, created_at DESC);
CREATE INDEX idx_request_logs_created ON request_logs(created_at);
CREATE INDEX idx_request_logs_errors ON request_logs(error_code) WHERE error_code IS NOT NULL;

-- Materialized view for daily MRR analytics
CREATE MATERIALIZED VIEW analytics_daily_metrics AS
SELECT 
  c.application_id,
  DATE_TRUNC('day', NOW()) as metric_date,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') as active_subscriptions,
  COUNT(DISTINCT s.id) FILTER (WHERE DATE(s.created_at) = CURRENT_DATE) as new_subscriptions,
  COUNT(DISTINCT s.id) FILTER (WHERE DATE(s.cancelled_at) = CURRENT_DATE) as churned_subscriptions,
  SUM(sp.price_cents) FILTER (WHERE s.status = 'active') as mrr_cents
FROM subscriptions s
JOIN customers c ON s.customer_id = c.id
JOIN subscription_plans sp ON s.plan_id = sp.id
WHERE s.test_mode = false
GROUP BY c.application_id;

CREATE UNIQUE INDEX idx_analytics_daily_metrics ON analytics_daily_metrics(application_id, metric_date);

-- Revenue analytics view
CREATE VIEW analytics_revenue AS
SELECT 
  c.application_id,
  DATE_TRUNC('month', i.created_at) as month,
  COUNT(DISTINCT i.id) as invoice_count,
  SUM(i.total_cents) FILTER (WHERE i.status = 'paid') as revenue_cents,
  SUM(i.total_cents) FILTER (WHERE i.status IN ('open', 'past_due')) as outstanding_cents,
  COUNT(DISTINCT i.customer_id) as unique_customers
FROM invoices i
JOIN customers c ON i.customer_id = c.id
WHERE i.test_mode = false
GROUP BY c.application_id, DATE_TRUNC('month', i.created_at);

-- Subscription metrics view
CREATE VIEW analytics_subscription_metrics AS
SELECT
  sp.application_id,
  sp.plan_code,
  sp.name as plan_name,
  COUNT(DISTINCT s.id) as subscription_count,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') as active_count,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'trialing') as trialing_count,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'past_due') as past_due_count,
  AVG(EXTRACT(EPOCH FROM (s.cancelled_at - s.created_at))/86400) FILTER (WHERE s.cancelled_at IS NOT NULL) as avg_lifetime_days
FROM subscriptions s
JOIN subscription_plans sp ON s.plan_id = sp.id
WHERE s.test_mode = false
GROUP BY sp.application_id, sp.plan_code, sp.name;

-- Comments
COMMENT ON TABLE xbs_subscriptions IS 'XBS own subscriptions (meta-billing)';
COMMENT ON TABLE xbs_usage_tracking IS 'Track XBS usage per application';
COMMENT ON TABLE xbs_invoices IS 'XBS invoices to its customers';
COMMENT ON TABLE request_logs IS 'API request logs for observability';
COMMENT ON MATERIALIZED VIEW analytics_daily_metrics IS 'Pre-computed daily MRR metrics';

-- ============================================================================
-- PERFORMANCE: Link invoice_id foreign key in usage_records
-- ============================================================================

ALTER TABLE usage_records 
  ADD CONSTRAINT fk_usage_invoice 
  FOREIGN KEY (invoice_id) REFERENCES invoices(id);

-- ============================================================================
-- COMPLETE
-- ============================================================================
