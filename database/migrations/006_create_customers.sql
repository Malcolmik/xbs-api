-- Migration 006: Customers
-- Description: End-users of SaaS companies using XBS

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  
  -- Identification
  external_id VARCHAR(255) NOT NULL, -- Client's user ID
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(50),
  
  -- Location
  country VARCHAR(2), -- ISO 3166-1 alpha-2
  tax_id VARCHAR(50),
  
  -- Status
  test_mode BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(application_id, external_id)
);

-- Indexes
CREATE INDEX idx_customers_app ON customers(application_id);
CREATE INDEX idx_customers_app_external ON customers(application_id, external_id);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_test ON customers(application_id, test_mode);
CREATE INDEX idx_customers_deleted ON customers(deleted_at) WHERE deleted_at IS NOT NULL;

-- Trigger
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE customers IS 'End-users of SaaS applications';
COMMENT ON COLUMN customers.external_id IS 'Application''s own user ID';
COMMENT ON COLUMN customers.test_mode IS 'Whether this is test data';
COMMENT ON COLUMN customers.deleted_at IS 'Soft delete timestamp for GDPR';
