# D1Table-Client Skill

A Cloudflare D1-based data table management client with full CRUD support for tables, records, notes, groups, and image uploads.

**API Version:** v3.0.0

## Features

- **Tables**: List, create, update, delete tables
- **Fields**: Get metadata, add/update/delete fields
- **Records**: Query (with filters/sort/search), get, insert, update, delete, batch insert, export
- **Notes**: Full CRUD, tree structure, soft-delete/restore, archive/unarchive, Knowledge Base
- **Groups**: Create, update, delete, set tables/keys
- **Images**: Upload (thumb + display), delete
- **Automatic ISO 8601 datetime parsing**

## Configuration

Priority from highest to lowest:

**Option 1: Environment variables (recommended)**
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
# Health check
python3 src/d1table_client.py health

# Tables
python3 src/d1table_client.py list-tables
python3 src/d1table_client.py schema --table users
python3 src/d1table_client.py create-table --name tbl_orders --title "Orders" --columns '[{"name":"col_item","title":"Item","type":"TEXT","field_type":"text"}]'
python3 src/d1table_client.py delete-table --table users

# Records
python3 src/d1table_client.py query --table users --limit 10 --filter "name:Alice"
python3 src/d1table_client.py get --table users --id 1
python3 src/d1table_client.py insert --table users --data '{"name":"Alice"}'
python3 src/d1table_client.py update --table users --id 1 --data '{"name":"Bob"}'
python3 src/d1table_client.py delete --table users --id 1

# Notes
python3 src/d1table_client.py list-notes
python3 src/d1table_client.py notes-tree
python3 src/d1table_client.py get-note --id n_abc123
python3 src/d1table_client.py create-note --title "My Note" --content "Hello"
python3 src/d1table_client.py delete-note --id n_abc123
python3 src/d1table_client.py archive-note --id n_abc123
python3 src/d1table_client.py unarchive-note --id n_abc123
python3 src/d1table_client.py archived-roots

# Groups
python3 src/d1table_client.py list-groups
python3 src/d1table_client.py create-group --name "Marketing"
python3 src/d1table_client.py delete-group --id 1
```

### Python API

```python
from d1table_client import D1TableClient

client = D1TableClient()

# Tables
tables = client.list_tables()
client.create_table("tbl_tasks", "Tasks", [
    {"name": "col_title", "title": "Title", "type": "TEXT", "field_type": "text"},
    {"name": "col_done", "title": "Done", "type": "INTEGER", "field_type": "checkbox"},
])
client.update_table("tbl_tasks", title="My Tasks", icon="ion:CheckboxOutline")
client.delete_table("tbl_tasks")

# Fields
fields = client.get_fields("users")
client.add_field("users", title="Phone", field_type="text")
client.update_field("users", "col_phone", title="Mobile Phone", width=200)
client.delete_field("users", "col_phone")

# Records
result = client.query_records("users", limit=10, sort="name:asc", name__like="Al%")
record = client.insert_record("users", {"name": "Alice", "email": "alice@example.com"})
client.update_record("users", "1", {"name": "Bob"})
client.delete_record("users", "1")
csv_bytes = client.export_records("users", fmt="csv")

# Notes
tree = client.get_notes_tree()
note = client.create_note("Meeting Notes", "# Agenda\n- Item 1", parent_id="n_root123")
client.update_note("n_abc123", content="Updated content")
client.archive_note("n_abc123")
client.unarchive_note("n_abc123")
kb_roots = client.get_archived_roots()
archived = client.get_archived_children("n_root123")

# Groups
groups = client.list_groups()
group = client.create_group("Engineering")
client.set_group_tables(group["id"], ["tbl_tasks", "tbl_bugs"])

# Images
result = client.upload_image("thumb.webp", "display.webp", name="photo.jpg")
client.delete_image(result["thumb"], result["display"])
```

## API Docs

`https://<your-instance>/api/docs`
