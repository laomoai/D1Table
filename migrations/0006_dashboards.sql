CREATE TABLE IF NOT EXISTS _dashboards (
  table_name TEXT PRIMARY KEY,
  config     TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER DEFAULT (unixepoch())
);
