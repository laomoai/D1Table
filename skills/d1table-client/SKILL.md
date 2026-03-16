# D1Table-Client Skill

A Cloudflare D1-based data table management client with support for dynamic table CRUD operations.

**API Version:** v2.0.0

## Features

- List all tables
- Get table schema (including field mapping)
- Query records (pagination, filtering, sorting)
- Insert / Update / Delete records
- Batch operations
- Field management
- **Automatic ISO 8601 datetime parsing**

## Configuration

Priority from highest to lowest:

**Option 1: Environment variables (recommended — works with CI/CD, Docker, any agent framework)**
```bash
export D1TABLE_URL=https://your-d1table-instance.com
export D1TABLE_KEY=your-api-key
```

**Option 2: Constructor arguments**
```python
client = D1TableClient(
    base_url="https://your-d1table-instance.com",
    api_key="your-api-key"
)
```

**Option 3: config.json (for OpenClaw and similar frameworks)**
```json
{
  "d1table": {
    "baseUrl": "https://your-d1table-instance.com",
    "apiKey": "your-api-key",
    "timeout": 30
  }
}
```

## Usage

### Command Line

```bash
# List all tables
python3 src/d1table_client.py list-tables

# Get table schema
python3 src/d1table_client.py schema --table users

# Query records
python3 src/d1table_client.py query --table users --limit 10

# Insert a record
python3 src/d1table_client.py insert --table users --data '{"name":"Alice"}'

# Update a record
python3 src/d1table_client.py update --table users --id 1 --data '{"name":"Bob"}'

# Delete a record
python3 src/d1table_client.py delete --table users --id 1
```

### Python API

```python
from d1table_client import D1TableClient

client = D1TableClient()

# List tables
tables = client.list_tables()

# Query records
records = client.query_records("users", limit=10)

# Insert a record
record = client.insert_record("users", {"name": "Alice", "email": "alice@example.com"})
```

## API Docs

`https://<your-instance>/api/docs`
