-- Migration 003: API Keys Table
-- Description: Authentication keys for applications (test/live modes)

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  
  -- Key data
  key_prefix VARCHAR(20) NOT NULL, -- e.g., "xbs_pk_live_", "xbs_sk_test_"
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_type VARCHAR(10) NOT NULL, -- 'test' or 'live'
  key_role VARCHAR(20) NOT NULL, -- 'publishable' or 'secret'
  name VARCHAR(100),
  
  -- Status
  active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Security
  ip_whitelist TEXT[], -- Array of allowed IP addresses
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_key_type CHECK (key_type IN ('test', 'live')),
  CONSTRAINT valid_key_role CHECK (key_role IN ('publishable', 'secret'))
);

-- Indexes
CREATE INDEX idx_api_keys_app ON api_keys(application_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(active, expires_at);
CREATE INDEX idx_api_keys_type ON api_keys(key_type, active);

-- Comments
COMMENT ON TABLE api_keys IS 'API authentication keys for applications';
COMMENT ON COLUMN api_keys.key_prefix IS 'Visible prefix like xbs_pk_live_ for identification';
COMMENT ON COLUMN api_keys.key_hash IS 'Hashed API key for validation';
COMMENT ON COLUMN api_keys.key_type IS 'Test or live mode key';
COMMENT ON COLUMN api_keys.key_role IS 'Publishable (frontend) or secret (backend) key';
