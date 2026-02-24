-- Migration 011: Payment Transactions
-- Description: Payment attempts with full audit trail

CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  
  -- Amount
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  
  -- Status
  status payment_status NOT NULL DEFAULT 'pending',
  
  -- Provider details
  provider VARCHAR(50) NOT NULL,
  provider_transaction_id VARCHAR(255),
  provider_response JSONB, -- Raw response from provider
  
  -- Error details
  failure_code VARCHAR(100),
  failure_message TEXT,
  
  -- Timestamps
  attempted_at TIMESTAMP,
  succeeded_at TIMESTAMP,
  failed_at TIMESTAMP,
  
  -- Idempotency
  idempotency_key VARCHAR(255) UNIQUE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transactions_invoice ON payment_transactions(invoice_id);
CREATE INDEX idx_transactions_payment_method ON payment_transactions(payment_method_id);
CREATE INDEX idx_transactions_status ON payment_transactions(status);
CREATE INDEX idx_transactions_provider ON payment_transactions(provider, provider_transaction_id);
CREATE INDEX idx_transactions_idempotency ON payment_transactions(idempotency_key);

-- Trigger
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Refunds table
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_transaction_id UUID NOT NULL REFERENCES payment_transactions(id),
  
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  reason TEXT,
  
  status payment_status NOT NULL DEFAULT 'pending',
  
  provider VARCHAR(50) NOT NULL,
  provider_refund_id VARCHAR(255),
  provider_response JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_refund_amount CHECK (amount_cents > 0)
);

CREATE INDEX idx_refunds_transaction ON refunds(payment_transaction_id);
CREATE INDEX idx_refunds_status ON refunds(status);

CREATE TRIGGER update_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE payment_transactions IS 'Payment attempts with full audit trail';
COMMENT ON COLUMN payment_transactions.provider_response IS 'Raw response from payment provider';
COMMENT ON TABLE refunds IS 'Refund transactions';
