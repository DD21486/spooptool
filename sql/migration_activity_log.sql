-- Recent activity log (last 30 entries). Run after schema.
-- Rows are pruned to 30 after each insert (in API).

CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  username VARCHAR(12) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('xp_kc', 'loot')),
  description TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_log_at ON activity_log (at DESC);

COMMENT ON TABLE activity_log IS 'Last 30 activities: XP/KC gains or loot drops. Pruned after each insert.';
