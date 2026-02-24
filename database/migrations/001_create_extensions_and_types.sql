-- Migration 001: Extensions and Custom Types
-- Description: Set up PostgreSQL extensions and custom ENUM types

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Subscription status enum
CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active', 
  'past_due',
  'suspended',
  'cancelled',
  'unpaid'
);

-- Invoice status enum
CREATE TYPE invoice_status AS ENUM (
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible'
);

-- Payment status enum  
CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded'
);

-- Payment method type enum
CREATE TYPE payment_method_type AS ENUM (
  'card',
  'bank_account',
  'mobile_money'
);

-- Outbox event status enum
CREATE TYPE outbox_status AS ENUM (
  'pending',
  'processing', 
  'delivered',
  'failed'
);

-- Webhook event type enum
CREATE TYPE webhook_event_status AS ENUM (
  'pending',
  'succeeded',
  'failed'
);

-- Dispute status enum
CREATE TYPE dispute_status AS ENUM (
  'pending',
  'under_review',
  'evidence_required',
  'won',
  'lost',
  'withdrawn'
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Completed: Extensions, enums, and utility functions created
