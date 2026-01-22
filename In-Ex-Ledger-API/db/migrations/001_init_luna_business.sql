-- =========================================
-- LUNA BUSINESS V1 — INITIAL POSTGRES SCHEMA
-- =========================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-------------------------------
-- USERS
-------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------
-- BUSINESSES (one per user)
-------------------------------
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT CHECK (region IN ('US','CA')) DEFAULT 'US',
  language TEXT CHECK (language IN ('en','es','fr')) DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------
-- ACCOUNTS
-------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------
-- CATEGORIES
-------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT CHECK (kind IN ('income','expense')) NOT NULL,
  tax_map_us TEXT,
  tax_map_ca TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------
-- TRANSACTIONS
-------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  category_id UUID REFERENCES categories(id),
  amount NUMERIC(12,2) NOT NULL,
  type TEXT CHECK (type IN ('income','expense')) NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------
-- RECEIPTS
-------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------
-- MILEAGE
-------------------------------
CREATE TABLE IF NOT EXISTS mileage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  trip_date DATE NOT NULL,
  purpose TEXT NOT NULL,
  destination TEXT,
  miles NUMERIC(10,2),      -- for US
  km NUMERIC(10,2),         -- for CA
  odometer_start NUMERIC(10,2),
  odometer_end NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);