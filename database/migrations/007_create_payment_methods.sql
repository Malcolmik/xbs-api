-- Migration 007: Payment Methods
-- Description: Customer payment methods (cards, bank accounts, mobile money)

CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Type
  type payment_method_type NOT NULL,
  
  -- Provider details
  provider VARCHAR(50) NOT NULL,
  provider_payment_method_id VARCHAR(255) NOT NULL,
  
  -- Card details (if type = 'card')
  card_brand VARCHAR(50),
  card_last4 VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,
  card_fingerprint VARCHAR(255), -- For duplicate detection
  
  -- Bank account details (if type = 'bank_account')
  bank_name VARCHAR(100),
  bank_code VARCHAR(20),
  account_last4 VARCHAR(4),
  account_holder_name VARCHAR(255),
  
  -- Mobile money details (if type = 'mobile_money')
  mobile_money_provider VARCHAR(50),
  phone_last4 VARCHAR(4),
  
  -- Status
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_card_exp CHECK (
    (card_exp_month IS NULL) OR 
    (card_exp_month BETWEEN 1 AND 12)
  ),
  CONSTRAINT valid_card_year CHECK (
    (card_exp_year IS NULL) OR
    (card_exp_year >= EXTRACT(YEAR FROM CURRENT_DATE))
  )
);

-- Indexes
CREATE INDEX idx_payment_methods_customer ON payment_methods(customer_id);
CREATE INDEX idx_payment_methods_default ON payment_methods(customer_id, is_default);
CREATE INDEX idx_payment_methods_provider ON payment_methods(provider, provider_payment_method_id);
CREATE INDEX idx_payment_methods_fingerprint ON payment_methods(card_fingerprint) 
  WHERE card_fingerprint IS NOT NULL;

-- Trigger
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one default payment method per customer
CREATE OR REPLACE FUNCTION ensure_single_default_payment_method()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE payment_methods 
    SET is_default = false 
    WHERE customer_id = NEW.customer_id 
      AND id != NEW.id 
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_default_payment_method
  BEFORE INSERT OR UPDATE ON payment_methods
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_payment_method();

-- Comments
COMMENT ON TABLE payment_methods IS 'Customer payment methods';
COMMENT ON COLUMN payment_methods.card_fingerprint IS 'Hash for duplicate card detection';
