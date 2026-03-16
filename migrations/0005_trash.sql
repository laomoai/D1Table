-- 回收站：存储被删除的记录快照
CREATE TABLE IF NOT EXISTS _trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  record_data TEXT NOT NULL,
  deleted_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_trash_table ON _trash(table_name);
CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON _trash(deleted_at);
