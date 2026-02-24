-- Migration 015: Disputes (Chargebacks)
-- Description: Track payment disputes and chargebacks

CREATE TABLE disputes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  payment_transaction_id UUID REFERENCES payment_transactions(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  
  -- Dispute details
  amount_cents INTEGER NOT NULL,
  reason VARCHAR(100),
  status dispute_status NOT NULL DEFAULT 'pending',
  
  -- Evidence
  evidence_url TEXT,
  evidence_notes TEXT,
  
  -- Resolution
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  
  -- Provider reference
  provider VARCHAR(50),
  provider_dispute_id VARCHAR(255),
  provider_response JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_amount CHECK (amount_cents > 0)
);

-- Indexes
CREATE INDEX idx_disputes_invoice ON disputes(invoice_id);
CREATE INDEX idx_disputes_customer ON disputes(customer_id);
CREATE INDEX idx_disputes_transaction ON disputes(payment_transaction_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_created ON disputes(created_at DESC);
CREATE INDEX idx_disputes_provider ON disputes(provider, provider_dispute_id);

-- Trigger
CREATE TRIGGER update_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE disputes IS 'Payment disputes and chargebacks';
COMMENT ON COLUMN disputes.evidence_url IS 'URL to uploaded evidence documents';
