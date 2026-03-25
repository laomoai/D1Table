-- 移除 _groups.name 的全局 UNIQUE 约束，改为 (name, team_id) 组合唯一
-- SQLite 不支持 DROP CONSTRAINT，需要重建表

CREATE TABLE IF NOT EXISTS _groups_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  owner_id INTEGER REFERENCES _users(id),
  team_id INTEGER REFERENCES _teams(id),
  UNIQUE(name, team_id)
);

INSERT INTO _groups_new (id, name, sort_order, created_at, owner_id, team_id)
  SELECT id, name, sort_order, created_at, owner_id, team_id FROM _groups;

DROP TABLE _groups;
ALTER TABLE _groups_new RENAME TO _groups;

CREATE INDEX IF NOT EXISTS idx_groups_team ON _groups(team_id);
