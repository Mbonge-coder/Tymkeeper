-- TymKeeper — New Features Migration
-- Run this in pgAdmin Query Tool connected to the tymkeeper database
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)

-- ─── 1. Add department & position to users ───
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS position   VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;

-- ─── 2. Clock schedule per user (set by admin) ───
CREATE TABLE IF NOT EXISTS work_schedules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  clock_in_time TIME NOT NULL DEFAULT '08:00',   -- expected clock-in
  clock_out_time TIME NOT NULL DEFAULT '17:00',  -- expected clock-out
  days_of_week  INTEGER[] DEFAULT '{1,2,3,4,5}', -- 1=Mon ... 7=Sun
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schedule_user ON work_schedules(user_id);

-- ─── 3. Session reasons & attachments (late/early/overtime) ───
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS late_reason       TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS early_leave_reason TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS overtime_reason   TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS attachment_url    VARCHAR(500);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS attachment_name   VARCHAR(255);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS late_minutes      INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS overtime_minutes  INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS early_leave_minutes INTEGER DEFAULT 0;

-- ─── 4. Departments master table ───
CREATE TABLE IF NOT EXISTS departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dept_company ON departments(company_id);

-- ─── 5. Work apps / links ───
CREATE TABLE IF NOT EXISTS work_apps (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  url         VARCHAR(500) NOT NULL,
  icon_color  VARCHAR(20) DEFAULT '#2563EB',
  category    VARCHAR(50) DEFAULT 'general',
  is_shared   BOOLEAN DEFAULT FALSE,  -- shared with whole company
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apps_user ON work_apps(user_id);
CREATE INDEX IF NOT EXISTS idx_apps_company ON work_apps(company_id);

-- ─── 6. Trigger for work_schedules ───
DROP TRIGGER IF EXISTS trg_schedules_updated ON work_schedules;
CREATE TRIGGER trg_schedules_updated
  BEFORE UPDATE ON work_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Confirm
SELECT 'Migration complete ✅' AS status;
