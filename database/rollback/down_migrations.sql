-- Rollback Script: Down Migrations
-- Description: Drop all tables and objects in reverse order

-- Drop materialized views
DROP MATERIALIZED VIEW IF EXISTS analytics_daily_metrics CASCADE;

-- Drop views
DROP VIEW IF EXISTS analytics_revenue CASCADE;
DROP VIEW IF EXISTS analytics_subscription_metrics CASCADE;

-- Drop XBS billing tables
DROP TABLE IF EXISTS xbs_invoices CASCADE;
DROP TABLE IF EXISTS xbs_usage_tracking CASCADE;
DROP TABLE IF EXISTS xbs_subscriptions CASCADE;
DROP TABLE IF EXISTS request_logs CASCADE;

-- Drop disputes
DROP TABLE IF EXISTS disputes CASCADE;

-- Drop exchange rates
DROP TABLE IF EXISTS supported_currencies CASCADE;
DROP TABLE IF EXISTS exchange_rates CASCADE;

-- Drop webhooks
DROP TABLE IF EXISTS processed_webhooks CASCADE;
DROP TABLE IF EXISTS webhook_deliveries CASCADE;
DROP TABLE IF EXISTS webhook_endpoints CASCADE;
DROP TABLE IF EXISTS outbox_events CASCADE;

-- Drop payment retries
DROP TABLE IF EXISTS dunning_configs CASCADE;
DROP TABLE IF EXISTS payment_retry_schedules CASCADE;

-- Drop payment transactions
DROP TABLE IF EXISTS refunds CASCADE;
DROP TABLE IF EXISTS payment_transactions CASCADE;

-- Drop invoices
DROP TABLE IF EXISTS credit_notes CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;

-- Drop usage
DROP TABLE IF EXISTS usage_metrics CASCADE;
DROP TABLE IF EXISTS usage_records CASCADE;

-- Drop subscriptions
DROP TABLE IF EXISTS subscription_state_changes CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;

-- Drop payment methods
DROP TABLE IF EXISTS payment_methods CASCADE;

-- Drop customers
DROP TABLE IF EXISTS customers CASCADE;

-- Drop plans
DROP TABLE IF EXISTS subscription_plans CASCADE;

-- Drop payment providers
DROP TABLE IF EXISTS payment_provider_configs CASCADE;

-- Drop API keys
DROP TABLE IF EXISTS api_keys CASCADE;

-- Drop applications
DROP TABLE IF EXISTS applications CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS ensure_default_payment_method() CASCADE;
DROP FUNCTION IF EXISTS ensure_single_default_payment_method() CASCADE;
DROP FUNCTION IF EXISTS ensure_single_default_payment_provider() CASCADE;
DROP FUNCTION IF EXISTS log_subscription_state_change() CASCADE;
DROP FUNCTION IF EXISTS prevent_invoice_modification() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Drop enums
DROP TYPE IF EXISTS dispute_status CASCADE;
DROP TYPE IF EXISTS webhook_event_status CASCADE;
DROP TYPE IF EXISTS outbox_status CASCADE;
DROP TYPE IF EXISTS payment_method_type CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS subscription_status CASCADE;

-- Drop extensions (optional - comment out if shared with other databases)
-- DROP EXTENSION IF EXISTS pgcrypto;
-- DROP EXTENSION IF EXISTS "uuid-ossp";

-- Complete rollback
