-- Migration 002: Applications Table
-- Description: SaaS companies using XBS (multi-tenant foundation)

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Company information
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  
  -- Webhook configuration
  webhook_url VARCHAR(500),
  webhook_secret VARCHAR(255),
  
  -- Settings
  default_currency VARCHAR(3) DEFAULT 'NGN',
  timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
  analytics_currency VARCHAR(3) DEFAULT 'USD',
  
  -- Invoice customization
  invoice_config JSONB DEFAULT '{
    "number_prefix": "INV",
    "number_format": "YYYY-NNNN",
    "logo_url": null,
    "company_name": null,
    "company_address": null,
    "company_tax_id": null,
    "footer_text": null,
    "color_primary": "#000000",
    "show_xbs_branding": true
  }'::jsonb,
  
  -- Status
  active BOOLEAN DEFAULT true,
  trial_ends_at TIMESTAMP,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_currency CHECK (default_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT valid_analytics_currency CHECK (analytics_currency ~ '^[A-Z]{3}$')
);

-- Indexes
CREATE INDEX idx_applications_active ON applications(active);
CREATE INDEX idx_applications_email ON applications(email);
CREATE INDEX idx_applications_trial_ends ON applications(trial_ends_at) WHERE trial_ends_at IS NOT NULL;

-- Trigger for updated_at
CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE applications IS 'SaaS companies using XBS for billing';
COMMENT ON COLUMN applications.webhook_url IS 'URL where XBS will send event notifications';
COMMENT ON COLUMN applications.invoice_config IS 'Custom invoice branding and formatting';
