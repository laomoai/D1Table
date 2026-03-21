-- Link field metadata: tracks table-to-table relationships
CREATE TABLE IF NOT EXISTS _link_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_table TEXT NOT NULL,
  source_field TEXT NOT NULL,
  target_table TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(source_table, source_field)
);
