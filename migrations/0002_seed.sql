-- 演示数据（可选，仅用于开发测试）
INSERT INTO contacts (name, email, phone, company, notes) VALUES
  ('张三', 'zhangsan@example.com', '13800138001', '示例科技', '重要客户'),
  ('李四', 'lisi@example.com', '13800138002', '云计算公司', NULL),
  ('王五', 'wangwu@example.com', '13800138003', '示例科技', '技术负责人'),
  ('赵六', 'zhaoliu@example.com', NULL, '互联网公司', NULL),
  ('陈七', 'chenqi@example.com', '13800138005', '大数据公司', '待跟进');

-- 更新计数
UPDATE _meta SET row_count = 5, updated_at = unixepoch() WHERE table_name = 'contacts';
