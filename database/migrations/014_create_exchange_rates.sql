-- Migration 014: Exchange Rates & Supported Currencies
-- Description: Multi-currency support with daily exchange rate updates

CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(12,6) NOT NULL,
  
  source VARCHAR(50) NOT NULL, -- 'exchangerate-api.com', 'fixer.io', etc.
  effective_date DATE NOT NULL,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(from_currency, to_currency, effective_date),
  
  CONSTRAINT valid_rate CHECK (rate > 0)
);

-- Indexes
CREATE INDEX idx_exchange_rates_currencies ON exchange_rates(from_currency, to_currency);
CREATE INDEX idx_exchange_rates_date ON exchange_rates(effective_date DESC);
CREATE INDEX idx_exchange_rates_lookup ON exchange_rates(from_currency, to_currency, effective_date DESC);

-- Supported currencies (13 African + global)
CREATE TABLE supported_currencies (
  code VARCHAR(3) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  symbol VARCHAR(10),
  decimal_places INTEGER DEFAULT 2,
  
  -- Regional grouping
  is_african BOOLEAN DEFAULT false,
  country_code VARCHAR(2),
  
  active BOOLEAN DEFAULT true
);

-- Insert supported currencies
INSERT INTO supported_currencies (code, name, symbol, is_african, country_code) VALUES
  -- African currencies
  ('NGN', 'Nigerian Naira', '₦', true, 'NG'),
  ('KES', 'Kenyan Shilling', 'KSh', true, 'KE'),
  ('GHS', 'Ghanaian Cedi', 'GH₵', true, 'GH'),
  ('ZAR', 'South African Rand', 'R', true, 'ZA'),
  ('EGP', 'Egyptian Pound', 'E£', true, 'EG'),
  ('TZS', 'Tanzanian Shilling', 'TSh', true, 'TZ'),
  ('UGX', 'Ugandan Shilling', 'USh', true, 'UG'),
  ('XOF', 'West African CFA Franc', 'CFA', true, 'CI'), -- Ivory Coast, Senegal, etc.
  ('XAF', 'Central African CFA Franc', 'FCFA', true, 'CM'), -- Cameroon, etc.
  ('MAD', 'Moroccan Dirham', 'DH', true, 'MA'),
  ('ETB', 'Ethiopian Birr', 'Br', true, 'ET'),
  ('RWF', 'Rwandan Franc', 'FRw', true, 'RW'),
  ('MUR', 'Mauritian Rupee', '₨', true, 'MU'),
  
  -- Global currencies
  ('USD', 'US Dollar', '$', false, 'US'),
  ('EUR', 'Euro', '€', false, 'EU'),
  ('GBP', 'British Pound', '£', false, 'GB'),
  ('INR', 'Indian Rupee', '₹', false, 'IN'),
  ('BRL', 'Brazilian Real', 'R$', false, 'BR'),
  ('JPY', 'Japanese Yen', '¥', false, 'JP'),
  ('CNY', 'Chinese Yuan', '¥', false, 'CN');

-- Comments
COMMENT ON TABLE exchange_rates IS 'Daily exchange rates for currency conversion';
COMMENT ON TABLE supported_currencies IS 'Currencies supported by XBS';
COMMENT ON COLUMN exchange_rates.effective_date IS 'Date this rate is effective from';
