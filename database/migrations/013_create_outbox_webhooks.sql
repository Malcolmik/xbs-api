-- Migration 013: Outbox Events & Webhooks
-- Description: Transactional outbox pattern for guaranteed webhook delivery

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id),
  
  -- Event details
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(50) NOT NULL, -- 'subscription', 'invoice', etc.
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  
  -- Processing status
  status outbox_status NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  next_retry_at TIMESTAMP,
  
  -- Error tracking
  last_error TEXT
);

-- Indexes
CREATE INDEX idx_outbox_pending ON outbox_events(status, next_retry_at) 
  WHERE status IN ('pending', 'failed');
CREATE INDEX idx_outbox_app ON outbox_events(application_id);
CREATE INDEX idx_outbox_event_type ON outbox_events(event_type);
CREATE INDEX idx_outbox_aggregate ON outbox_events(aggregate_type, aggregate_id);

-- Webhook endpoints (customer configurations)
CREATE TABLE webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(255) NOT NULL,
  description VARCHAR(255),
  
  -- Event filtering
  enabled_events TEXT[], -- Specific events to send, NULL = all events
  
  -- Status
  active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_endpoints_app ON webhook_endpoints(application_id);
CREATE INDEX idx_webhook_endpoints_active ON webhook_endpoints(application_id, active);

CREATE TRIGGER update_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Webhook delivery log
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outbox_event_id UUID NOT NULL REFERENCES outbox_events(id),
  webhook_endpoint_id UUID REFERENCES webhook_endpoints(id),
  
  -- Request details
  url VARCHAR(500) NOT NULL,
  http_status INTEGER,
  request_headers JSONB,
  request_body JSONB,
  response_body TEXT,
  
  -- Result
  success BOOLEAN,
  error_message TEXT,
  duration_ms INTEGER,
  
  attempted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_event ON webhook_deliveries(outbox_event_id);
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id);
CREATE INDEX idx_webhook_deliveries_success ON webhook_deliveries(success, attempted_at);

-- Processed webhooks (replay attack prevention)
CREATE TABLE processed_webhooks (
  webhook_id VARCHAR(255) PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id),
  processed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_processed_webhooks_date ON processed_webhooks(processed_at);
CREATE INDEX idx_processed_webhooks_app ON processed_webhooks(application_id);

-- Comments
COMMENT ON TABLE outbox_events IS 'Transactional outbox for guaranteed webhook delivery';
COMMENT ON TABLE webhook_endpoints IS 'Customer webhook endpoint configurations';
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempt log';
COMMENT ON TABLE processed_webhooks IS 'Prevents webhook replay attacks';
