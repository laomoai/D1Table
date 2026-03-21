#!/usr/bin/env bash
set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ─── Banner ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ____  _ _____     _     _      "
echo " |  _ \\/ |_   _|_ _| |__ | | ___ "
echo " | | | | | | |/ _\` | '_ \\| |/ _ \\"
echo " | |_| | | | | (_| | |_) | |  __/"
echo " |____/|_| |_|\\__,_|_.__/|_|\\___|"
echo -e "${NC}"
echo -e "${BOLD}One-click deploy to Cloudflare Workers${NC}"
echo ""

# ─── 1. Check prerequisites ──────────────────────────────────────────────────
info "Checking prerequisites..."

command -v node >/dev/null 2>&1 || error "Node.js is not installed. Install it from https://nodejs.org/"
command -v npm  >/dev/null 2>&1 || error "npm is not installed."
command -v npx  >/dev/null 2>&1 || error "npx is not installed."

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  error "Node.js 18+ is required (found $(node -v))"
fi

# Check if wrangler is available (global or local)
if command -v wrangler >/dev/null 2>&1; then
  WRANGLER="wrangler"
elif npx wrangler --version >/dev/null 2>&1; then
  WRANGLER="npx wrangler"
else
  error "Wrangler CLI is not available. Install it: npm install -g wrangler"
fi

ok "Node.js $(node -v), npm $(npm -v), wrangler available"

# Check wrangler login
info "Checking Cloudflare authentication..."
if ! $WRANGLER whoami 2>/dev/null | grep -q "You are logged in"; then
  warn "You are not logged in to Cloudflare."
  info "Running 'wrangler login'..."
  $WRANGLER login
fi
ok "Authenticated with Cloudflare"

# ─── 2. Create D1 database ───────────────────────────────────────────────────
info "Creating D1 database 'd1table'..."

D1_OUTPUT=$($WRANGLER d1 create d1table 2>&1) || {
  if echo "$D1_OUTPUT" | grep -q "already exists"; then
    warn "D1 database 'd1table' already exists."
    # Try to get existing database_id
    D1_LIST=$($WRANGLER d1 list 2>&1)
    DATABASE_ID=$(echo "$D1_LIST" | grep "d1table" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
    if [ -z "$DATABASE_ID" ]; then
      error "Could not find database_id for existing 'd1table' database. Check 'wrangler d1 list'."
    fi
  else
    echo "$D1_OUTPUT"
    error "Failed to create D1 database."
  fi
}

if [ -z "${DATABASE_ID:-}" ]; then
  DATABASE_ID=$(echo "$D1_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
fi

if [ -z "$DATABASE_ID" ]; then
  error "Could not parse database_id from wrangler output."
fi

ok "D1 database ready — ID: ${DATABASE_ID}"

# ─── 3. Create R2 bucket ─────────────────────────────────────────────────────
info "Creating R2 bucket 'd1table-files'..."

R2_OUTPUT=$($WRANGLER r2 bucket create d1table-files 2>&1) || {
  if echo "$R2_OUTPUT" | grep -qi "already exists"; then
    warn "R2 bucket 'd1table-files' already exists."
  else
    echo "$R2_OUTPUT"
    error "Failed to create R2 bucket."
  fi
}

ok "R2 bucket ready"

# ─── 4. Generate wrangler.toml ───────────────────────────────────────────────
info "Generating wrangler.toml..."

if [ -f "wrangler.toml" ]; then
  warn "wrangler.toml already exists. Backing up to wrangler.toml.bak"
  cp wrangler.toml wrangler.toml.bak
fi

sed "s/YOUR_DATABASE_ID/${DATABASE_ID}/" wrangler.toml.example > wrangler.toml
ok "wrangler.toml generated with database_id=${DATABASE_ID}"

# ─── 5. Configure secrets ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}Google OAuth Configuration${NC}"
echo -e "You need a Google OAuth 2.0 Client ID. If you don't have one yet:"
echo -e "  1. Go to ${CYAN}https://console.cloud.google.com/apis/credentials${NC}"
echo -e "  2. Create an OAuth 2.0 Client ID (Web application)"
echo -e "  3. Add redirect URI: ${CYAN}https://d1table.<your-subdomain>.workers.dev/api/auth/callback${NC}"
echo ""

read -rp "Enter GOOGLE_CLIENT_ID: " GOOGLE_CLIENT_ID
if [ -z "$GOOGLE_CLIENT_ID" ]; then
  error "GOOGLE_CLIENT_ID is required."
fi

read -rp "Enter GOOGLE_CLIENT_SECRET: " GOOGLE_CLIENT_SECRET
if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
  error "GOOGLE_CLIENT_SECRET is required."
fi

read -rp "Enter ALLOWED_EMAILS (comma-separated, or leave empty for any): " ALLOWED_EMAILS

# Generate random SESSION_SECRET
SESSION_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
ok "Generated random SESSION_SECRET"

info "Setting secrets via wrangler..."
echo "$GOOGLE_CLIENT_ID"     | $WRANGLER secret put GOOGLE_CLIENT_ID
echo "$GOOGLE_CLIENT_SECRET" | $WRANGLER secret put GOOGLE_CLIENT_SECRET
echo "$SESSION_SECRET"       | $WRANGLER secret put SESSION_SECRET

if [ -n "$ALLOWED_EMAILS" ]; then
  echo "$ALLOWED_EMAILS" | $WRANGLER secret put ALLOWED_EMAILS
  ok "Set 4 secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET, ALLOWED_EMAILS)"
else
  ok "Set 3 secrets (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET)"
fi

# ─── 6. Install dependencies ─────────────────────────────────────────────────
info "Installing dependencies..."
npm install
cd web && npm install && cd ..
ok "Dependencies installed"

# ─── 7. Build frontend ───────────────────────────────────────────────────────
info "Building frontend..."
npm run build:web
ok "Frontend built"

# ─── 8. Run migrations ───────────────────────────────────────────────────────
info "Running database migrations..."
for f in migrations/0*.sql; do
  info "  Applying $(basename "$f")..."
  $WRANGLER d1 execute d1table --remote --file="$f"
done
ok "All migrations applied"

# ─── 9. Deploy ────────────────────────────────────────────────────────────────
info "Deploying to Cloudflare Workers..."
DEPLOY_OUTPUT=$($WRANGLER deploy 2>&1)
echo "$DEPLOY_OUTPUT"

# Try to extract the URL
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1)

# ─── Done! ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}========================================${NC}"
echo -e "${GREEN}${BOLD}  Deployment complete!${NC}"
echo -e "${GREEN}${BOLD}========================================${NC}"
echo ""

if [ -n "${DEPLOY_URL:-}" ]; then
  echo -e "  URL: ${CYAN}${BOLD}${DEPLOY_URL}${NC}"
else
  echo -e "  URL: ${CYAN}https://d1table.<your-subdomain>.workers.dev${NC}"
fi

echo ""
echo -e "${YELLOW}${BOLD}IMPORTANT:${NC} Update your Google OAuth redirect URI to:"
if [ -n "${DEPLOY_URL:-}" ]; then
  echo -e "  ${CYAN}${DEPLOY_URL}/api/auth/callback${NC}"
else
  echo -e "  ${CYAN}https://d1table.<your-subdomain>.workers.dev/api/auth/callback${NC}"
fi
echo ""
echo -e "The first user to sign in will automatically become the admin."
echo ""
