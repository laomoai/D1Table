-- 分组定义
CREATE TABLE IF NOT EXISTS _groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 表 ↔ 分组（多对多）
CREATE TABLE IF NOT EXISTS _group_tables (
  group_id INTEGER NOT NULL REFERENCES _groups(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  PRIMARY KEY (group_id, table_name)
);

-- API Key ↔ 分组（多对多）
CREATE TABLE IF NOT EXISTS _api_key_groups (
  key_id INTEGER NOT NULL REFERENCES _api_keys(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES _groups(id) ON DELETE CASCADE,
  PRIMARY KEY (key_id, group_id)
);

-- 现有表加字段：scope = 'all'（全部表）| 'groups'（指定分组）
ALTER TABLE _api_keys ADD COLUMN scope TEXT NOT NULL DEFAULT 'all';
