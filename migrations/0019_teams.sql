-- 团队表
CREATE TABLE IF NOT EXISTS _teams (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_by INTEGER REFERENCES _users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 用户表添加 team_id（每个用户只属于一个团队）
ALTER TABLE _users ADD COLUMN team_id INTEGER REFERENCES _teams(id);

-- 已有数据表添加 team_id
ALTER TABLE _meta ADD COLUMN team_id INTEGER REFERENCES _teams(id);
ALTER TABLE _groups ADD COLUMN team_id INTEGER REFERENCES _teams(id);
ALTER TABLE _notes ADD COLUMN team_id INTEGER REFERENCES _teams(id);
ALTER TABLE _trash ADD COLUMN team_id INTEGER REFERENCES _teams(id);
ALTER TABLE _dashboards ADD COLUMN team_id INTEGER REFERENCES _teams(id);
ALTER TABLE _api_keys ADD COLUMN team_id INTEGER REFERENCES _teams(id);

CREATE INDEX IF NOT EXISTS idx_meta_team ON _meta(team_id);
CREATE INDEX IF NOT EXISTS idx_groups_team ON _groups(team_id);
CREATE INDEX IF NOT EXISTS idx_notes_team ON _notes(team_id);
CREATE INDEX IF NOT EXISTS idx_trash_team ON _trash(team_id);

-- 数据迁移：为每个现有用户创建个人团队
INSERT INTO _teams (name, created_by)
  SELECT COALESCE(name, email) || '''s Team', id FROM _users;

-- 用户关联到自己的团队
UPDATE _users SET team_id = (
  SELECT t.id FROM _teams t WHERE t.created_by = _users.id
);

-- 迁移现有数据的 team_id
UPDATE _meta SET team_id = (
  SELECT t.id FROM _teams t WHERE t.created_by = _meta.owner_id
) WHERE owner_id IS NOT NULL;

UPDATE _groups SET team_id = (
  SELECT t.id FROM _teams t WHERE t.created_by = _groups.owner_id
) WHERE owner_id IS NOT NULL;

UPDATE _notes SET team_id = (
  SELECT t.id FROM _teams t WHERE t.created_by = _notes.owner_id
) WHERE owner_id IS NOT NULL;

UPDATE _trash SET team_id = (
  SELECT t.id FROM _teams t WHERE t.created_by = _trash.owner_id
) WHERE owner_id IS NOT NULL;

UPDATE _api_keys SET team_id = (
  SELECT t.id FROM _teams t WHERE t.created_by = _api_keys.user_id
) WHERE user_id IS NOT NULL;
