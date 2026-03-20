-- 用户偏好设置：存储每个用户的 UI 偏好（表排序、组展开状态等）
CREATE TABLE IF NOT EXISTS _user_preferences (
  user_id    INTEGER PRIMARY KEY REFERENCES _users(id) ON DELETE CASCADE,
  data       TEXT    NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
