-- GE Tracker: cache last price per item and item mapping so the page can load from DB.
-- Run in Neon SQL Editor after schema.sql.
-- Optional: set env GE_SYNC_SECRET and call GET /api/aggregate-history?path=ge&route=sync&secret=YOUR_SECRET
-- to populate from the OSRS Wiki (run once or on a schedule). Otherwise the page still works by fetching from the wiki on demand.

-- Last price per item (from OSRS Wiki /latest). ~3.7k rows, ~0.3 MB.
CREATE TABLE IF NOT EXISTS ge_item_prices (
  item_id BIGINT PRIMARY KEY,
  high BIGINT,
  low BIGINT,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ge_item_prices IS 'Last known GE high/low per item; populated from OSRS Wiki API';

-- Item list (from OSRS Wiki /mapping) for names and limits. ~3.7k rows.
CREATE TABLE IF NOT EXISTS ge_items (
  item_id BIGINT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  "limit" INT,
  value BIGINT,
  members BOOLEAN,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ge_items IS 'GE item mapping (name, limit); populated from OSRS Wiki API';
