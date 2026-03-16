# D1Table-Client Skill

基于 Cloudflare D1 的数据表管理客户端，支持动态表 CRUD 操作。

**API 版本:** v2.0.0

## 功能

- 获取所有表列表
- 获取表结构（含字段映射）
- 查询记录（分页、筛选、排序）
- 新增/更新/删除记录
- 批量操作
- 字段管理
- **ISO 8601 时间格式自动解析**

## 配置

优先级从高到低：

**方式一：环境变量（推荐，适用于 CI/CD、Docker、任意 Agent 框架）**
```bash
export D1TABLE_URL=https://your-d1table-instance.com
export D1TABLE_KEY=your-api-key
```

**方式二：构造函数参数**
```python
client = D1TableClient(
    base_url="https://your-d1table-instance.com",
    api_key="your-api-key"
)
```

**方式三：config.json（适用于 OpenClaw 等框架）**
```json
{
  "d1table": {
    "baseUrl": "https://your-d1table-instance.com",
    "apiKey": "your-api-key",
    "timeout": 30
  }
}
```

## 使用

### 命令行

```bash
# 列出所有表
python3 src/d1table_client.py list-tables

# 获取表结构
python3 src/d1table_client.py schema --table users

# 查询记录
python3 src/d1table_client.py query --table users --limit 10

# 新增记录
python3 src/d1table_client.py insert --table users --data '{"name":"张三"}'

# 更新记录
python3 src/d1table_client.py update --table users --id 1 --data '{"name":"李四"}'

# 删除记录
python3 src/d1table_client.py delete --table users --id 1
```

### Python API

```python
from d1table_client import D1TableClient

client = D1TableClient()

# 列出表
tables = client.list_tables()

# 查询记录
records = client.query_records("users", limit=10)

# 插入记录
record = client.insert_record("users", {"name": "张三", "email": "zhangsan@example.com"})
```

## API 文档

`https://<your-instance>/api/docs`
