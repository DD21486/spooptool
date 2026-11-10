-- One row for the shared spoop world, so ticks survive a serverless restart
-- and Discord can be told about each new update exactly once.

CREATE TABLE IF NOT EXISTS spoop_world (
  id SMALLINT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE spoop_world IS 'Current spoop roster, clock, and gear. Updated when the world advances.';
