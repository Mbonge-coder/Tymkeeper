-- TymKeeper — Subscriptions & Billing Migration
-- Run in pgAdmin Query Tool connected to tymkeeper database

-- ─── Plan definitions (reference table) ───
CREATE TABLE IF NOT EXISTS plans (
  id           VARCHAR(20) PRIMARY KEY,  -- 'free', 'growth', 'scale'
  name         VARCHAR(50) NOT NULL,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_annual  NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_staff     INTEGER NOT NULL DEFAULT 5,  -- -1 = unlimited
  features      JSONB DEFAULT '{}',
  is_active     BOOLEAN DEFAULT TRUE
);

INSERT INTO plans (id, name, price_monthly, price_annual, max_staff, features) VALUES
('free',   'Free Starter', 0,      0,       5,  '{"excel_export":false,"work_schedules":false,"departments":false,"priority_support":false,"custom_branding":false,"multi_company":false}'),
('growth', 'Growth',      299.00,  209.00,  25, '{"excel_export":true,"work_schedules":true,"departments":true,"priority_support":false,"custom_branding":false,"multi_company":false}'),
('scale',  'Scale',       799.00,  559.00,  -1, '{"excel_export":true,"work_schedules":true,"departments":true,"priority_support":true,"custom_branding":true,"multi_company":true}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, price_monthly = EXCLUDED.price_monthly,
  price_annual = EXCLUDED.price_annual, max_staff = EXCLUDED.max_staff,
  features = EXCLUDED.features;

-- ─── Company subscriptions ───
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id             VARCHAR(20) NOT NULL REFERENCES plans(id) DEFAULT 'free',
  billing_cycle       VARCHAR(10) DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  status              VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','cancelled','past_due','trialing','paused')),

  -- PayFast fields
  pf_token            VARCHAR(255),         -- PayFast subscription token
  pf_payment_id       VARCHAR(255),         -- PayFast payment ID
  pf_merchant_payment_id VARCHAR(255),      -- our internal payment reference

  -- Dates
  trial_ends_at       TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_company ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_sub_status ON subscriptions(status);

-- ─── Payment history ───
CREATE TABLE IF NOT EXISTS payment_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  plan_id         VARCHAR(20) REFERENCES plans(id),
  amount          NUMERIC(10,2) NOT NULL,
  currency        VARCHAR(5) DEFAULT 'ZAR',
  billing_cycle   VARCHAR(10),
  status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','complete','failed','cancelled')),
  pf_payment_id   VARCHAR(255),
  pf_token        VARCHAR(255),
  itn_data        JSONB DEFAULT '{}',   -- full PayFast ITN payload
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_company ON payment_history(company_id);

-- ─── Seed free subscription for all existing companies ───
INSERT INTO subscriptions (company_id, plan_id, status, current_period_end)
SELECT id, 'free', 'active', NOW() + INTERVAL '100 years'
FROM companies
ON CONFLICT (company_id) DO NOTHING;

-- ─── Auto-update trigger ───
DROP TRIGGER IF EXISTS trg_sub_updated ON subscriptions;
CREATE TRIGGER trg_sub_updated
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

SELECT 'Subscriptions migration complete ✅' AS status;
