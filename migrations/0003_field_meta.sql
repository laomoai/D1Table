-- 字段元数据表：存储每个字段的显示名、类型、顺序、宽度、可见性
CREATE TABLE IF NOT EXISTS _field_meta (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name     TEXT    NOT NULL,
  column_name    TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  field_type     TEXT    NOT NULL DEFAULT 'text',
  select_options TEXT,
  order_index    INTEGER NOT NULL DEFAULT 0,
  width          INTEGER NOT NULL DEFAULT 180,
  is_hidden      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(table_name, column_name)
);

CREATE INDEX IF NOT EXISTS idx_field_meta_table ON _field_meta(table_name);

-- _meta 表扩展 title 列（表的显示名）
ALTER TABLE _meta ADD COLUMN title TEXT;

-- 为已存在的 contacts 表初始化字段元数据
INSERT OR IGNORE INTO _field_meta (table_name, column_name, title, field_type, order_index, width) VALUES
  ('contacts', 'id',         'ID',   'number',   0, 80),
  ('contacts', 'name',       '姓名', 'text',     1, 200),
  ('contacts', 'email',      '邮箱', 'email',    2, 200),
  ('contacts', 'phone',      '电话', 'text',     3, 150),
  ('contacts', 'company',    '公司', 'text',     4, 200),
  ('contacts', 'notes',      '备注', 'longtext', 5, 250),
  ('contacts', 'created_at', '创建时间', 'datetime', 6, 160);

-- 初始化 contacts 显示名
UPDATE _meta SET title = '联系人' WHERE table_name = 'contacts';
