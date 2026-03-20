-- Notes system: independent notes, table-level docs, row-level notes
CREATE TABLE IF NOT EXISTS _notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  table_name TEXT,
  row_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  owner_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (parent_id) REFERENCES _notes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_parent ON _notes(parent_id);
CREATE INDEX IF NOT EXISTS idx_notes_table ON _notes(table_name);
CREATE INDEX IF NOT EXISTS idx_notes_row ON _notes(table_name, row_id);
CREATE INDEX IF NOT EXISTS idx_notes_owner ON _notes(owner_id);
