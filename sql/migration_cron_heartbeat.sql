-- Stores last successful run time per cron job for health indicator on homepage.
-- Run after schema.

CREATE TABLE IF NOT EXISTS cron_heartbeat (
  job_name VARCHAR(64) PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cron_heartbeat IS 'Updated by cron jobs on success; homepage orb reads this for green/red status.';
