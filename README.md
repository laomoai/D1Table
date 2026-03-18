# D1Table

A lightweight data table management tool built on **Cloudflare Workers + D1**. Create tables, manage records through a spreadsheet-like UI, and expose a clean REST API — all running at the edge with zero server maintenance.

Designed as a structured data backend for **AI Agents** — agents read and write via REST API, humans monitor and manage via the visual interface.

## Features

- **Google OAuth login** — sign in with Google; allowed emails controlled via environment variable
- **Dynamic tables** — create, rename, and delete tables without touching SQL
- **Spreadsheet UI** — AG Grid-powered table view with sorting, filtering, column resizing, and inline editing
- **Detail view** — expand any row; select/checkbox fields save instantly, text/date fields save on blur
- **REST API** — full CRUD with keyset pagination, field filtering, and batch inserts
- **OpenAPI docs** — auto-generated docs at `/api/docs`, readable by AI Agents
- **Field types** — text, longtext, number, currency, percent, email, URL, date, datetime, checkbox, select
- **Table groups** — organize tables into groups; restrict API key access per group
- **API key management** — multiple keys, readonly/read-write permissions, group-scoped access
- **Recycle bin** — deleted records are soft-deleted and retained for 30 days
- **Sidebar customization** — adjustable font size and text color, persisted to localStorage
- **Cost-optimized** — keyset pagination (no `OFFSET`), `_meta` row count cache (no `COUNT(*)` scans), Cache API for GET responses

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
- A Google Cloud project with OAuth 2.0 credentials

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
wrangler d1 execute d1table --remote --file=migrations/0001_init.sql
wrangler d1 execute d1table --remote --file=migrations/0003_field_meta.sql
wrangler d1 execute d1table --remote --file=migrations/0004_groups.sql
wrangler d1 execute d1table --remote --file=migrations/0005_trash.sql
```

### 4. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add authorized redirect URIs:
   - `https://your-domain.com/api/auth/callback`
   - `http://localhost:8787/api/auth/callback` (for local dev)

### 5. Set secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET      # any random 32+ character string
wrangler secret put ALLOWED_EMAILS      # comma-separated, e.g. alice@gmail.com,bob@gmail.com
```

> `ALLOWED_EMAILS` can also be set as a plain text variable in the Cloudflare Dashboard (easier to update without redeploying).

### 6. Deploy

```bash
npm run deploy
```

Your instance will be available at `https://d1table.<your-subdomain>.workers.dev`.

To use a custom domain, go to **Cloudflare Dashboard** → Workers & Pages → d1table → Settings → Domains & Routes.

---

## Local Development

```bash
# Copy and fill in local secrets
cp .dev.vars.example .dev.vars
# Edit .dev.vars: add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, ALLOWED_EMAILS

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

## Authentication

### Web UI

Sign in with Google. Access is restricted to emails listed in `ALLOWED_EMAILS`. Session is stored as an HMAC-signed cookie (30-day expiry), no database required.

### API (AI Agents)

All API requests require an `X-API-Key` header. Create keys in Settings → API Keys.

```bash
curl https://your-instance.com/api/tables \
  -H "X-API-Key: your_api_key"
```

---

## API

The full REST API is documented at `/api/docs` (powered by Scalar). A machine-readable OpenAPI JSON is available at `/api/openapi.json`.

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

D1Table uses **keyset pagination** — pass the `next_cursor` from the previous response as the `cursor` parameter:

```bash
# First page
curl "/api/tables/contacts/records?page_size=20"

# Next page
curl "/api/tables/contacts/records?page_size=20&cursor=42"
```

### Filtering and sorting

```bash
# Equality filter
/api/tables/contacts/records?filter[name]=Alice

# Contains filter
/api/tables/contacts/records?filter[name__like]=ali

# Operators: __gt, __gte, __lt, __lte, __ne, __like, __nlike

# Sort
/api/tables/contacts/records?sort=created_at:desc
```

---

## Python Client

A Python client SDK is included in `skills/d1table-client/`. Requires `pip install requests`.

### Configuration

```bash
export D1TABLE_URL=https://your-instance.com
export D1TABLE_KEY=your-api-key
```

### Python API

```python
from d1table_client import D1TableClient

client = D1TableClient()

# List tables
tables = client.list_tables()

# Query records
result = client.query_records("contacts", limit=20, sort="created_at:desc")
# result["data"] → list of records
# result["meta"]["next_cursor"] → pass as cursor for next page

# Filter
result = client.query_records("contacts", name="Alice")

# Insert
record = client.insert_record("contacts", {"name": "Alice", "email": "alice@example.com"})

# Batch insert (up to 500)
result = client.batch_insert("contacts", [
    {"name": "Alice", "email": "alice@example.com"},
    {"name": "Bob",   "email": "bob@example.com"},
])

# Update / delete
client.update_record("contacts", "1", {"name": "Bob"})
client.delete_record("contacts", "1")  # moves to trash
```

---

## Project Structure

```
D1Table/
├── src/                    # Cloudflare Worker (Hono.js API)
│   ├── index.ts            # Entry point + OpenAPI spec
│   ├── middleware/         # Auth middleware (session + API key)
│   ├── routes/             # API route handlers (tables, records, fields, auth, ...)
│   └── utils/              # Query builder, session signing, schema helpers
├── web/                    # Vue 3 frontend
│   └── src/
│       ├── pages/          # Dashboard, TableView, Settings, Login
│       ├── components/     # DataGrid, AppLayout, RowExpand, FilterBar, ...
│       └── api/            # Axios client
├── migrations/             # D1 SQL migrations (run in order)
├── skills/
│   └── d1table-client/     # Python client SDK
└── wrangler.toml           # Cloudflare Workers config
```

---

## License

MIT
