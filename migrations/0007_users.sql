-- 用户表：取代 ALLOWED_EMAILS 环境变量，成为用户授权的唯一来源
CREATE TABLE IF NOT EXISTS _users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL DEFAULT '',
  picture    TEXT    NOT NULL DEFAULT '',
  role       TEXT    NOT NULL DEFAULT 'user',   -- admin | user
  status     TEXT    NOT NULL DEFAULT 'active',  -- active | disabled
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login INTEGER
);

-- 系统表加 owner_id / user_id
ALTER TABLE _meta ADD COLUMN owner_id INTEGER REFERENCES _users(id);
ALTER TABLE _groups ADD COLUMN owner_id INTEGER REFERENCES _users(id);
ALTER TABLE _api_keys ADD COLUMN user_id INTEGER REFERENCES _users(id);
ALTER TABLE _trash ADD COLUMN owner_id INTEGER REFERENCES _users(id);
ALTER TABLE _dashboards ADD COLUMN owner_id INTEGER REFERENCES _users(id);

-- 索引加速 owner 过滤
CREATE INDEX IF NOT EXISTS idx_meta_owner ON _meta(owner_id);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON _groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON _api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_trash_owner ON _trash(owner_id);
