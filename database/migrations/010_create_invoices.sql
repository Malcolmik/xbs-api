-- Migration 010: Invoices
-- Description: Generated bills with immutability after finalization

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  
  -- Invoice identification
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  
  -- Amounts (in cents)
  subtotal_cents INTEGER NOT NULL,
  tax_cents INTEGER DEFAULT 0,
  total_cents INTEGER NOT NULL,
  amount_paid_cents INTEGER DEFAULT 0,
  amount_due_cents INTEGER NOT NULL,
  
  currency VARCHAR(3) DEFAULT 'NGN',
  
  -- Tax details
  tax_rate DECIMAL(5,4),
  tax_name VARCHAR(50),
  customer_country VARCHAR(2),
  
  -- Billing period
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  
  -- Dates
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMP,
  voided_at TIMESTAMP,
  
  -- Line items (JSONB array)
  line_items JSONB NOT NULL,
  
  -- Test mode
  test_mode BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_amounts CHECK (
    total_cents = subtotal_cents + tax_cents AND
    amount_due_cents <= total_cents AND
    amount_paid_cents <= total_cents AND
    subtotal_cents >= 0
  ),
  CONSTRAINT valid_dates CHECK (due_date >= issue_date)
);

-- Indexes
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due ON invoices(due_date, status) 
  WHERE status IN ('open', 'past_due');
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_test ON invoices(test_mode);
CREATE INDEX idx_invoices_period ON invoices(period_start, period_end);

-- Trigger
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Prevent modification of finalized invoices
CREATE OR REPLACE FUNCTION prevent_invoice_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'draft' AND 
     (NEW.subtotal_cents != OLD.subtotal_cents OR 
      NEW.total_cents != OLD.total_cents OR
      NEW.line_items != OLD.line_items) THEN
    RAISE EXCEPTION 'Cannot modify amounts or line items on finalized invoice';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_invoice_modification_trigger
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  WHEN (OLD.status != 'draft')
  EXECUTE FUNCTION prevent_invoice_modification();

-- Credit notes for adjustments
CREATE TABLE credit_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  
  amount_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  issued_by VARCHAR(100) NOT NULL, -- admin email or 'system'
  
  refunded_via_provider BOOLEAN DEFAULT false,
  provider_refund_id VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_amount CHECK (amount_cents > 0)
);

CREATE INDEX idx_credit_notes_invoice ON credit_notes(invoice_id);

-- Comments
COMMENT ON TABLE invoices IS 'Generated bills (immutable after finalization)';
COMMENT ON COLUMN invoices.line_items IS 'Array of invoice line items in JSONB';
COMMENT ON TABLE credit_notes IS 'Invoice adjustments and refunds';
