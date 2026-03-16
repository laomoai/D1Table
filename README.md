# D1Table

A lightweight, self-hosted data table management tool built on **Cloudflare Workers + D1**. Create tables, manage records through a spreadsheet-like UI, and expose a clean REST API — all running at the edge with zero server maintenance.

Designed to work as a personal database backend for AI Agents, automation scripts, and internal tools.

## Features

- **Dynamic tables** — create, rename, and delete tables without touching SQL
- **Spreadsheet UI** — AG Grid-powered table view with sorting, filtering, column resizing, and inline editing
- **REST API** — full CRUD with keyset pagination, field filtering, and batch inserts
- **OpenAPI docs** — auto-generated docs at `/api/docs`, readable by AI Agents
- **Field types** — text, longtext, number, email, URL, date, datetime, checkbox, select
- **Table groups** — organize tables into groups; restrict API key access per group
- **API key management** — multiple keys, readonly/read-write permissions, group-scoped access
- **Recycle bin** — deleted records are soft-deleted and retained for 30 days
- **Cost-optimized** — keyset pagination (no `OFFSET`), `_meta` row count cache (no `COUNT(*)` scans), parallel D1 queries

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| API framework | Hono.js |
| Frontend | Vue 3 + Vite |
| UI components | Naive UI |
| Data grid | AG Grid Community |
| Data fetching | TanStack Vue Query |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — `npm install -g wrangler`
- A Cloudflare account

### 1. Clone and install

```bash
git clone https://github.com/0xAlger/D1Table.git
cd D1Table
npm install
cd web && npm install && cd ..
```

### 2. Create a D1 database

```bash
wrangler d1 create d1table
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "d1table"
database_id = "YOUR_DATABASE_ID"   # ← paste here
```

### 3. Run migrations

```bash
# Apply all migrations in order
wrangler d1 execute d1table --remote --file=migrations/0001_init.sql
wrangler d1 execute d1table --remote --file=migrations/0003_field_meta.sql
wrangler d1 execute d1table --remote --file=migrations/0004_groups.sql
wrangler d1 execute d1table --remote --file=migrations/0005_trash.sql
```

### 4. Set the admin key

```bash
wrangler secret put ADMIN_KEY
# Enter a strong secret key when prompted — this is your master admin password
```

### 5. Deploy

```bash
npm run deploy
```

Your instance will be available at `https://d1table.<your-subdomain>.workers.dev`.

To use a custom domain, add a route in the **Cloudflare Dashboard** → Workers & Pages → d1table → Settings → Domains & Routes.

---

## Local Development

```bash
# Copy the example env file and fill in a local admin key
cp .dev.vars.example .dev.vars

# Run migrations locally
wrangler d1 execute d1table --local --file=migrations/0001_init.sql
wrangler d1 execute d1table --local --file=migrations/0003_field_meta.sql
wrangler d1 execute d1table --local --file=migrations/0004_groups.sql
wrangler d1 execute d1table --local --file=migrations/0005_trash.sql

# Start the Worker (port 8787) and the Vite dev server (port 5173) in separate terminals
npm run dev:worker
npm run dev:web
```

Open `http://localhost:5173` in your browser.

---

## API

The full REST API is documented at `/api/docs` (powered by Scalar). A machine-readable OpenAPI JSON is available at `/api/openapi.json`.

### Authentication

All API requests require an `X-API-Key` header:

```bash
curl https://your-instance.com/api/tables \
  -H "X-API-Key: your_api_key"
```

### Quick reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/tables` | List all tables |
| `POST` | `/api/tables` | Create a table |
| `GET` | `/api/tables/:name/records` | List records (paginated) |
| `POST` | `/api/tables/:name/records` | Create a record |
| `POST` | `/api/tables/:name/records/batch` | Batch create (up to 500) |
| `PATCH` | `/api/tables/:name/records/:id` | Update a record |
| `DELETE` | `/api/tables/:name/records/:id` | Delete a record (to trash) |
| `GET` | `/api/tables/:name/fields` | Get field metadata |
| `GET` | `/api/admin/keys` | List API keys |
| `POST` | `/api/admin/keys` | Create an API key |

### Pagination

D1Table uses **keyset pagination** — pass the `next_cursor` from the previous response as the `cursor` parameter for the next page:

```bash
# First page
curl "/api/tables/contacts/records?page_size=20"

# Next page
curl "/api/tables/contacts/records?page_size=20&cursor=42"
```

### Filtering and sorting

```bash
# Filter: field equals value
/api/tables/contacts/records?filter[name]=Alice

# Filter: field contains value
/api/tables/contacts/records?filter[name__like]=ali

# Filter operators: __gt, __gte, __lt, __lte, __ne, __like

# Sort
/api/tables/contacts/records?sort=created_at:desc
```

---

## Python Client

A Python client SDK is included in `skills/d1table-client/`.

```bash
# Configure via environment variables
export D1TABLE_URL=https://your-instance.com
export D1TABLE_KEY=your-api-key

# List tables
python3 skills/d1table-client/src/d1table_client.py list-tables

# Query records
python3 skills/d1table-client/src/d1table_client.py query --table contacts --limit 10
```

Or use it as a Python library:

```python
from d1table_client import D1TableClient

client = D1TableClient()
records = client.query_records("contacts", limit=10)
record = client.insert_record("contacts", {"name": "Alice", "email": "alice@example.com"})
```

See [`skills/d1table-client/SKILL.md`](skills/d1table-client/SKILL.md) for full documentation.

---

## Project Structure

```
D1Table/
├── src/                    # Cloudflare Worker (Hono.js API)
│   ├── index.ts            # Entry point + OpenAPI spec
│   ├── middleware/         # Auth middleware
│   ├── routes/             # API route handlers
│   └── utils/              # Query builder, schema helpers
├── web/                    # Vue 3 frontend
│   └── src/
│       ├── pages/          # Settings, Dashboard, TableView
│       ├── components/     # DataGrid, AppLayout, modals
│       └── api/            # API client (axios)
├── migrations/             # D1 SQL migrations (run in order)
├── skills/
│   └── d1table-client/     # Python client SDK
└── wrangler.toml           # Cloudflare Workers config
```

---

## License

MIT
