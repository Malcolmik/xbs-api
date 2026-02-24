-- Plans table (skip if already exists)
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  external_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  billing_interval VARCHAR(20) NOT NULL CHECK (billing_interval IN ('day', 'week', 'month', 'year')),
  billing_interval_count INTEGER NOT NULL DEFAULT 1,
  prices JSONB NOT NULL DEFAULT '[]'::jsonb,
  trial_period_days INTEGER NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'draft')),
  test_mode BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  archived_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT unique_plan_external_id UNIQUE (application_id, external_id, test_mode)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plans_application_id ON plans(application_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_test_mode ON plans(test_mode);
CREATE INDEX IF NOT EXISTS idx_plans_created_at ON plans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plans_external_id ON plans(application_id, external_id) WHERE external_id IS NOT NULL;
