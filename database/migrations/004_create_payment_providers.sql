-- Migration 004: Payment Provider Configurations
-- Description: Store encrypted credentials for payment providers (XoroPay, Stripe, etc.)

CREATE TABLE payment_provider_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  
  -- Provider details
  provider_name VARCHAR(50) NOT NULL, -- 'xoropay', 'stripe', 'paystack', 'flutterwave'
  credentials_encrypted TEXT NOT NULL, -- Encrypted with pgcrypto
  
  -- Settings
  is_default BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(application_id, provider_name),
  
  -- Constraints
  CONSTRAINT valid_provider_name CHECK (
    provider_name IN ('xoropay', 'stripe', 'paystack', 'flutterwave', 'other')
  )
);

-- Indexes
CREATE INDEX idx_payment_providers_app ON payment_provider_configs(application_id);
CREATE INDEX idx_payment_providers_default ON payment_provider_configs(application_id, is_default) 
  WHERE is_default = true;

-- Trigger
CREATE TRIGGER update_payment_providers_updated_at
  BEFORE UPDATE ON payment_provider_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one default provider per application
CREATE OR REPLACE FUNCTION ensure_single_default_payment_provider()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE payment_provider_configs 
    SET is_default = false 
    WHERE application_id = NEW.application_id 
      AND id != NEW.id 
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_default_payment_provider
  BEFORE INSERT OR UPDATE ON payment_provider_configs
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_payment_provider();

-- Comments
COMMENT ON TABLE payment_provider_configs IS 'Payment provider credentials per application';
COMMENT ON COLUMN payment_provider_configs.credentials_encrypted IS 'PGP encrypted credentials';
