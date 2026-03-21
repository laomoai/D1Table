# D1Table

A lightweight data table management tool built on **Cloudflare Workers + D1**. Create tables, manage records through a spreadsheet-like UI, and expose a clean REST API — all running at the edge with zero server maintenance.

Designed as a structured data backend for **AI Agents** — agents read and write via REST API, humans monitor and manage via the visual interface.

## Features

### Core
- **Dynamic tables** — create, rename, and delete tables without touching SQL
- **Spreadsheet UI** — AG Grid-powered table view with sorting, filtering, column resizing, and inline editing
- **Gallery view** — card-based layout for image-heavy data
- **Chart view** — ECharts-powered multi-widget dashboard with persistent configuration
- **Detail view** — expand any row; select/checkbox fields save instantly, text/date fields save on blur
- **Field types** — text, longtext, number, currency, percent, email, URL, date, datetime, checkbox, select, image
- **Image management** — upload with auto WebP compression, dual-size storage (thumb + display) via R2

### Organization & Customization
- **Table groups** — organize tables into named collections; restrict API key access per group
- **Table icons** — set emoji or Ionicons as table icons, displayed in sidebar, dashboard, and toolbar
- **Drag-to-reorder** — reorder tables in the sidebar; order persists to database per user
- **Sidebar customization** — adjustable font size and text color
- **User preferences** — table order, group collapse state, and sidebar settings synced to database (cross-device)

### Auth & Multi-user
- **Google OAuth login** — sign in with Google; first user becomes admin
- **Multi-user support** — admin/user roles, active/disabled status
- **User management** — invite users by email, assign roles, view table counts per user
- **API key system** — readonly/read-write permissions, all/group-scoped access
- **Session management** — HMAC-SHA256 signed cookies, 30-day expiry

### Data Management
- **REST API** — full CRUD with keyset pagination, field filtering, sorting, and batch inserts (up to 500)
- **OpenAPI docs** — auto-generated at `/api/docs`, machine-readable spec at `/api/openapi.json`
- **Recycle bin** — deleted records are soft-deleted and retained for 30 days
- **Schema export** — export table schema to CSV
- **Cost-optimized** — keyset pagination (no `OFFSET`), `_meta` row count cache (no `COUNT(*)` scans)

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (edge computing) |
| Database | Cloudflare D1 (SQLite) |
| File storage | Cloudflare R2 (images) |
| API framework | Hono.js |
| Frontend | Vue 3 + Vite |
| UI components | Naive UI |
| Data grid | AG Grid Community |
| Charts | ECharts |
| Data fetching | TanStack Vue Query |

## Quick Deploy

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — `npm install -g wrangler`
- A Cloudflare account (free tier works)
- A Google Cloud project with OAuth 2.0 credentials ([setup guide below](#set-up-google-oauth))

### One-click deploy

```bash
git clone https://github.com/nicepkg/D1Table.git
cd D1Table
./setup.sh
```

The script will:
1. Create a D1 database and R2 bucket on your Cloudflare account
2. Generate `wrangler.toml` from the template
3. Prompt for your Google OAuth credentials
4. Install dependencies, build, run migrations, and deploy

Your instance will be available at `https://d1table.<your-subdomain>.workers.dev`.

### Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create Credentials** → **OAuth 2.0 Client ID**
2. Application type: **Web application**
3. Add authorized redirect URI: `https://d1table.<your-subdomain>.workers.dev/api/auth/callback`
4. Copy the **Client ID** and **Client Secret** — the setup script will ask for these

> For local development, also add `http://localhost:8787/api/auth/callback` as a redirect URI.

### Manual deploy

<details>
<summary>If you prefer to deploy step by step</summary>

#### 1. Clone and install

```bash
git clone https://github.com/nicepkg/D1Table.git
cd D1Table
npm install
cd web && npm install && cd ..
```

#### 2. Create Cloudflare resources

```bash
wrangler d1 create d1table
wrangler r2 bucket create d1table-files
```

Copy the `database_id` from the output.

#### 3. Configure

```bash
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml — replace YOUR_DATABASE_ID with the actual ID
```

#### 4. Set secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET        # any random 32+ character string
wrangler secret put ALLOWED_EMAILS        # optional: comma-separated emails
```

#### 5. Run migrations and deploy

```bash
for f in migrations/0*.sql; do wrangler d1 execute d1table --remote --file=$f; done
npm run deploy
```

</details>

---

## Local Development

```bash
# Copy and fill in local secrets
cp .dev.vars.example .dev.vars
# Edit .dev.vars: add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET

# Run migrations locally
for f in migrations/0*.sql; do wrangler d1 execute d1table --local --file=$f; done

# Start the Worker (port 8787) and the Vite dev server (port 5173) in separate terminals
npm run dev:worker
npm run dev:web
```

Open `http://localhost:5173` in your browser.

---

## Authentication

### Web UI

Sign in with Google. The first user is automatically set as admin and can invite other users from Settings → Users. Session is stored as an HMAC-signed cookie (30-day expiry).

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
| `PATCH` | `/api/tables/:name` | Update table title/icon |
| `DELETE` | `/api/tables/:name` | Delete a table |
| `GET` | `/api/tables/:name/records` | List records (paginated) |
| `POST` | `/api/tables/:name/records` | Create a record |
| `POST` | `/api/tables/:name/records/batch` | Batch create (up to 500) |
| `PATCH` | `/api/tables/:name/records/:id` | Update a record |
| `DELETE` | `/api/tables/:name/records/:id` | Delete a record (to trash) |
| `GET` | `/api/tables/:name/fields` | Get field metadata |
| `POST` | `/api/tables/:name/fields` | Add a field |
| `GET/PUT` | `/api/tables/:name/dashboard` | Get/save chart dashboard config |
| `GET/PUT` | `/api/user/preferences` | Get/save user preferences |
| `GET` | `/api/groups` | List groups |
| `POST` | `/api/groups` | Create a group |
| `GET` | `/api/admin/keys` | List API keys |
| `POST` | `/api/admin/keys` | Create an API key |
| `GET` | `/api/admin/users` | List users (admin only) |
| `GET` | `/api/trash` | List deleted records |

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
│   ├── middleware/          # Auth middleware (session + API key)
│   ├── routes/             # API route handlers
│   └── utils/              # Query builder, session signing, schema helpers
├── web/                    # Vue 3 frontend
│   └── src/
│       ├── pages/          # Dashboard, TableView, Settings, Login
│       ├── components/     # DataGrid, GalleryView, ChartView, IconPicker, ...
│       └── api/            # Axios client + types
├── migrations/             # D1 SQL migrations (run in order)
├── skills/
│   └── d1table-client/     # Python client SDK
├── setup.sh                # One-click deploy script
├── wrangler.toml.example   # Config template (copy to wrangler.toml)
└── wrangler.toml           # Your local config (git-ignored)
```

---

## License

MIT
