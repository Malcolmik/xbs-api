-- Migration 012: Payment Retry Schedules (Dunning)
-- Description: Failed payment retry logic

CREATE TABLE payment_retry_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  
  attempt_number INTEGER NOT NULL,
  scheduled_for TIMESTAMP NOT NULL,
  attempted_at TIMESTAMP,
  
  success BOOLEAN,
  transaction_id UUID REFERENCES payment_transactions(id),
  error_message TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_attempt CHECK (attempt_number > 0)
);

-- Indexes
CREATE INDEX idx_retry_schedules_due ON payment_retry_schedules(scheduled_for) 
  WHERE attempted_at IS NULL;
CREATE INDEX idx_retry_schedules_invoice ON payment_retry_schedules(invoice_id);
CREATE INDEX idx_retry_schedules_attempt ON payment_retry_schedules(invoice_id, attempt_number);

-- Dunning configurations per application
CREATE TABLE dunning_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  
  -- Retry schedule (days after failure)
  retry_schedule INTEGER[] DEFAULT ARRAY[1, 3, 5, 7],
  
  -- Actions
  send_emails BOOLEAN DEFAULT true,
  suspend_after_attempts INTEGER DEFAULT 4,
  cancel_after_days INTEGER DEFAULT 14,
  
  -- Email settings
  email_sender_name VARCHAR(100),
  email_sender_address VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dunning_configs_app ON dunning_configs(application_id);

CREATE TRIGGER update_dunning_configs_updated_at
  BEFORE UPDATE ON dunning_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE payment_retry_schedules IS 'Scheduled payment retry attempts';
COMMENT ON TABLE dunning_configs IS 'Application-specific dunning configuration';
COMMENT ON COLUMN dunning_configs.retry_schedule IS 'Days after failure to retry (e.g., [1,3,5,7])';
