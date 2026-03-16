-- D1Table 初始化迁移
-- 执行：npm run db:migrate:local（本地）或 npm run db:migrate（生产）

-- API Key 表
-- key_hash 存储 SHA-256(plaintext_key)，明文不入库
CREATE TABLE IF NOT EXISTS _api_keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key_prefix  TEXT    NOT NULL,               -- 明文前10位，用于在UI中识别
  key_hash    TEXT    NOT NULL UNIQUE,         -- SHA-256 哈希
  name        TEXT    NOT NULL,               -- 用户给的备注名
  type        TEXT    NOT NULL DEFAULT 'readonly', -- readonly | readwrite
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- 行数计数表（替代 COUNT(*) 全表扫描）
-- 每次 INSERT/DELETE 同步更新，查总数只需读1行
CREATE TABLE IF NOT EXISTS _meta (
  table_name  TEXT    PRIMARY KEY,
  row_count   INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 演示表：联系人
CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  email       TEXT,
  phone       TEXT,
  company     TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 为常用筛选字段建索引，避免全表扫描（直接影响 D1 行读取成本）
CREATE INDEX IF NOT EXISTS idx_contacts_name    ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_email   ON contacts(email);

-- 初始化计数
INSERT OR IGNORE INTO _meta (table_name, row_count) VALUES ('contacts', 0);
