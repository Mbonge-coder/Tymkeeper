-- TymKeeper — Shift Chat Migration
-- Run in pgAdmin Query Tool connected to tymkeeper database

-- ─── Shift Messages ───
CREATE TABLE IF NOT EXISTS shift_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'announcement')),
  is_pinned   BOOLEAN DEFAULT FALSE,
  pinned_by   UUID REFERENCES users(id),
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_msg_company ON shift_messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shift_msg_user ON shift_messages(user_id);

-- ─── Message reactions (emoji reactions) ───
CREATE TABLE IF NOT EXISTS shift_message_reactions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES shift_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_msg ON shift_message_reactions(message_id);

SELECT 'Shift chat migration complete ✅' AS status;
