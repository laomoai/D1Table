# D1Table

D1Table is a lightweight data workspace built on **Cloudflare Workers + D1 + R2**.

It combines database-style table management, notes, charts, trash recovery, team access control, and API documentation in one UI. It works well for both human operators and AI agents that need a stable REST API.

## What It Is Good For

- Internal team data management
- Lightweight back office tools
- Structured content, account, task, or research databases
- Shared notes + tables in one workspace
- AI agent memory stores and operational dashboards
- Secure API access via scoped API keys

## Core Features

### Tables and Views

- Create, edit, lock, and delete tables dynamically
- Grid, gallery, kanban, chart, and dashboard-style views
- Rich field types including text, long text, number, currency, percent, email, URL, date, datetime, checkbox, select, image, linked record, note link, password, TOTP, and more
- Row detail drawer for fast inspection and editing
- Batch record creation
- Record export
- Table grouping, recent tables, and search

### Notes

- Tree-based notes with nested pages
- Rich note editing with preview
- Note icons, locking, trash, and restore flow
- Current-note import/export tools
- Notes available alongside tables in the main navigation

### Settings and Admin

- Google OAuth sign-in
- Admin and regular user roles
- Team management
- User preference sync
- API key management with revoke support and permanent delete for revoked keys
- System-level export area in `Settings > Import / Export`
  - Export Notes bundle
  - Export Tables bundle
  - Export Schema CSV

### Safety and Permissions

- Soft-delete and trash for records, tables, and notes
- Restore and permanent delete from trash
- Table locks
- Scoped API keys:
  - read-only or read-write
  - all tables or selected groups
  - all notes, no notes, or selected note roots

### API and Automation

- Auto-generated API documentation
- OpenAPI JSON for agent/tool discovery
- Server and script access via `X-API-Key`

## Documentation

- User guide: `docs/使用说明.md`
- Google OAuth setup notes: `docs/google-auth-spec.md`
- API docs: `/api/docs` after deployment
- OpenAPI JSON: `/api/openapi.json` after deployment
- Chinese README: `README.md`

## Tech Stack

- Backend: Hono on Cloudflare Workers
- Database: Cloudflare D1
- File storage: Cloudflare R2
- Frontend: Vue 3 + Vite + Naive UI
- Charts: ECharts

## Quick Start

### Requirements

- Node.js 18+
- npm
- Wrangler CLI
- Cloudflare account
- Google Cloud OAuth 2.0 credentials

### One-Command Setup

```bash
git clone https://github.com/nicepkg/D1Table.git
cd D1Table
./setup.sh
```

The setup script will help you:

1. Create D1 and R2 resources
2. Generate local configuration
3. Fill in Google OAuth values
4. Install dependencies
5. Run migrations
6. Build and deploy

## Manual Setup

### 1. Install Dependencies

```bash
git clone https://github.com/nicepkg/D1Table.git
cd D1Table
npm install
cd web && npm install && cd ..
```

### 2. Create Cloudflare Resources

```bash
wrangler d1 create d1table
wrangler r2 bucket create d1table-files
```

Save the D1 database ID for the next step.

### 3. Configure Wrangler

```bash
cp wrangler.toml.example wrangler.toml
```

Then update `wrangler.toml` with your own D1 and R2 resource identifiers.

### 4. Set Production Secrets

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put ALLOWED_EMAILS
wrangler secret put ADMIN_KEY
```

Notes:

- `SESSION_SECRET` should be a long random string.
- `ALLOWED_EMAILS` is optional. If omitted, email allowlisting is disabled.
- `ADMIN_KEY` is recommended for operational access.

### 5. Run Migrations

```bash
npm run db:migrate
```

Use the migration script instead of running individual SQL files manually.

### 6. Deploy

```bash
npm run deploy
```

## Preview Environment

The project also supports a separate preview environment.

Suggested naming:

- D1: `d1table-preview`
- R2: `d1table-preview-files`

Set preview secrets:

```bash
wrangler secret put GOOGLE_CLIENT_ID --env preview
wrangler secret put GOOGLE_CLIENT_SECRET --env preview
wrangler secret put SESSION_SECRET --env preview
wrangler secret put ALLOWED_EMAILS --env preview
wrangler secret put ADMIN_KEY --env preview
```

Run preview migration and deploy:

```bash
npm run db:migrate:preview
npm run deploy:preview
```

## Local Development

### 1. Create Local Env File

```bash
cp .dev.vars.example .dev.vars
```

Fill in:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

### 2. Run Local Migrations

```bash
npm run db:migrate:local
```

### 3. Start the App

Run these in two terminals:

```bash
npm run dev:worker
```

```bash
npm run dev:web
```

Open:

- Frontend: `http://localhost:5173`
- Worker: `http://localhost:8787`

## Google OAuth Callback URLs

Configure the callback URL in Google Cloud Console.

Production:

```text
https://your-domain.com/api/auth/callback
```

Preview:

```text
https://your-preview-domain.com/api/auth/callback
```

Local:

```text
http://localhost:8787/api/auth/callback
```

## Authentication

### Web Login

- Sign in with Google
- The first signed-in user becomes the initial admin
- Admins can manage users and teams in `Settings`

### API Requests

Use this header:

```text
X-API-Key: your_api_key
```

This project does not use Bearer tokens for API key access.

## Common Commands

```bash
# local development
npm run dev:worker
npm run dev:web

# build frontend
npm run build:web

# local migration
npm run db:migrate:local

# production migration
npm run db:migrate

# preview migration
npm run db:migrate:preview

# production deploy
npm run deploy

# preview deploy
npm run deploy:preview
```

## API Overview

For the full contract, always use the deployed:

- `/api/docs`
- `/api/openapi.json`

Main capabilities include:

- table management
- field management
- record CRUD and search
- batch inserts
- record export
- dashboard config persistence
- group management
- user preferences
- API key management
- user and team management
- trash restore and permanent delete
- notes management
- image upload and delete

### Export Limits

- Record export is capped at 10,000 rows per request
- Requests beyond that limit return an explicit error

## Project Structure

- `src` - Worker API and backend logic
- `web` - Vue frontend
- `migrations` - database migrations
- `scripts` - migration and deployment helpers
- `docs` - design notes and docs
- `tests` - test files

## Pre-Launch Checklist

1. Production secrets are configured
2. Google OAuth callback URLs are correct
3. Production migrations have run
4. Login works
5. Creating tables and records works
6. Trash restore works
7. `/api/docs` and `/api/openapi.json` are reachable

## License

MIT
