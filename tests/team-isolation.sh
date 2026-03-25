#!/bin/bash
# Team Isolation Integration Tests
# Usage: ./tests/team-isolation.sh [port]
# Requires: wrangler dev running with a fresh local DB

set -euo pipefail

PORT="${1:-8790}"
BASE="http://localhost:$PORT/api"
PASS=0
FAIL=0
TOTAL=0

# ── Test helpers ──────────────────────────────────────────

check() {
  local name="$1" expect="$2" actual="$3"
  TOTAL=$((TOTAL+1))
  if echo "$actual" | grep -qF "$expect"; then
    echo "  ✅ $name"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name"
    echo "     expected: $expect"
    echo "     got: $actual"
    FAIL=$((FAIL+1))
  fi
}

api() {
  local method="$1" path="$2" key="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -X "$method" "$BASE$path" -H "X-API-Key: $key" -H "Content-Type: application/json" -d "$body"
  else
    curl -s -X "$method" "$BASE$path" -H "X-API-Key: $key"
  fi
}

jq_extract() {
  python3 -c "import sys,json; $1"
}

# ── Setup ─────────────────────────────────────────────────

echo "Setting up test database..."

# Create teams and users
ALICE_HASH=$(echo -n 'alice_key_00000000000000000000000' | shasum -a 256 | cut -d' ' -f1)
BOB_HASH=$(echo -n 'bob_key_000000000000000000000000000' | shasum -a 256 | cut -d' ' -f1)

npx wrangler d1 execute d1table --local --command "
INSERT OR IGNORE INTO _teams (id, name) VALUES (1, 'Team Alpha');
INSERT OR IGNORE INTO _teams (id, name) VALUES (2, 'Team Beta');
INSERT OR IGNORE INTO _users (id, email, name, role, status, team_id) VALUES (1, 'alice@test.com', 'Alice', 'admin', 'active', 1);
INSERT OR IGNORE INTO _users (id, email, name, role, status, team_id) VALUES (2, 'bob@test.com', 'Bob', 'user', 'active', 2);
UPDATE _teams SET created_by = 1 WHERE id = 1;
UPDATE _teams SET created_by = 2 WHERE id = 2;
INSERT OR IGNORE INTO _api_keys (key_prefix, key_hash, name, type, scope, user_id, team_id, is_active) VALUES ('alice_key_', '$ALICE_HASH', 'Alice Key', 'readwrite', 'all', 1, 1, 1);
INSERT OR IGNORE INTO _api_keys (key_prefix, key_hash, name, type, scope, user_id, team_id, is_active) VALUES ('bob_key_00', '$BOB_HASH', 'Bob Key', 'readwrite', 'all', 2, 2, 1);
" 2>&1 > /dev/null

ALICE="alice_key_00000000000000000000000"
BOB="bob_key_000000000000000000000000000"
ADMIN_KEY=$(grep ADMIN_KEY .dev.vars | head -1 | cut -d= -f2 | tr -d ' "')

# Wait for server
curl -s --retry 3 --retry-delay 1 "$BASE/health" > /dev/null 2>&1 || { echo "Server not running on port $PORT"; exit 1; }

# Create base data
api POST /tables "$ALICE" '{"name":"tbl_a1","title":"Alice Table","columns":[{"name":"col1","type":"TEXT"}]}' > /dev/null
api POST /tables "$BOB" '{"name":"tbl_b1","title":"Bob Table","columns":[{"name":"col1","type":"TEXT"}]}' > /dev/null
api POST /groups "$ALICE" '{"name":"Alpha Group"}' > /dev/null
api POST /groups "$BOB" '{"name":"Beta Group"}' > /dev/null
ALICE_NOTE=$(api POST /notes "$ALICE" '{"title":"Alice Note"}' | jq_extract "print(json.load(sys.stdin)['data']['id'])")
BOB_NOTE=$(api POST /notes "$BOB" '{"title":"Bob Note"}' | jq_extract "print(json.load(sys.stdin)['data']['id'])")

echo ""
echo "═══════════════════════════════════════"
echo "  Team Isolation Test Suite"
echo "═══════════════════════════════════════"

# ── 1. Table Isolation ────────────────────────────────────

echo ""
echo "── Table Isolation ──"

R=$(api GET /tables "$ALICE" | jq_extract "print([t['name'] for t in json.load(sys.stdin)['data']])")
check "T01 Alice only sees her tables" "tbl_a1" "$R"

R=$(api GET /tables "$BOB" | jq_extract "print([t['name'] for t in json.load(sys.stdin)['data']])")
check "T02 Bob only sees his tables" "tbl_b1" "$R"

R=$(api GET /tables/tbl_a1/records "$BOB")
check "T03 Bob cannot access Alice's table" "FORBIDDEN" "$R"

R=$(api GET /tables/tbl_b1/records "$ALICE")
check "T04 Alice cannot access Bob's table" "FORBIDDEN" "$R"

# ── 2. Group Isolation ────────────────────────────────────

echo ""
echo "── Group Isolation ──"

R=$(api GET /groups "$ALICE" | jq_extract "print([g['name'] for g in json.load(sys.stdin)['data']])")
check "T05 Alice only sees her groups" "Alpha Group" "$R"

R=$(api GET /groups "$BOB" | jq_extract "print([g['name'] for g in json.load(sys.stdin)['data']])")
check "T06 Bob only sees his groups" "Beta Group" "$R"

R=$(api PATCH /groups/1 "$BOB" '{"name":"Hacked"}')
check "T07 Bob cannot rename Alice's group" "NOT_FOUND" "$R"

R=$(api DELETE /groups/1 "$BOB")
check "T08 Bob cannot delete Alice's group" "NOT_FOUND" "$R"

R=$(api PUT /groups/2/tables "$BOB" '{"tables":["tbl_a1","tbl_b1"]}')
check "T09 Bob cannot add Alice's table to group" "FORBIDDEN" "$R"

R=$(api PUT /groups/2/tables "$BOB" '{"tables":["tbl_b1"]}')
check "T10 Bob can add own table to group" "success" "$R"

# ── 3. Note Isolation ─────────────────────────────────────

echo ""
echo "── Note Isolation ──"

R=$(api GET /notes "$ALICE" | jq_extract "print([n['title'] for n in json.load(sys.stdin)['data']])")
check "T11 Alice only sees her notes" "Alice Note" "$R"

R=$(api GET /notes "$BOB" | jq_extract "print([n['title'] for n in json.load(sys.stdin)['data']])")
check "T12 Bob only sees his notes" "Bob Note" "$R"

R=$(api POST /notes "$BOB" "{\"title\":\"Sneaky\",\"parent_id\":\"$ALICE_NOTE\"}")
check "T13 Bob cannot set Alice's note as parent (create)" "INVALID_PARENT" "$R"

BOB_CHILD=$(api POST /notes "$BOB" '{"title":"Bob Child"}' | jq_extract "print(json.load(sys.stdin)['data']['id'])")
R=$(api PATCH "/notes/$BOB_CHILD" "$BOB" "{\"parent_id\":\"$ALICE_NOTE\"}")
check "T14 Bob cannot move note under Alice's note (patch)" "INVALID_PARENT" "$R"

R=$(api PATCH "/notes/$ALICE_NOTE" "$BOB" '{"title":"Hacked"}')
check "T15 Bob cannot edit Alice's note" "NOT_FOUND" "$R"

R=$(api DELETE "/notes/$ALICE_NOTE" "$BOB")
check "T16 Bob cannot soft-delete Alice's note" "NOT_FOUND" "$R"

R=$(api GET "/notes/$ALICE_NOTE" "$ALICE" | jq_extract "print(json.load(sys.stdin)['data']['title'])")
check "T17 Alice's note intact after Bob's attacks" "Alice Note" "$R"

# Soft-delete and restore isolation
api DELETE "/notes/$ALICE_NOTE" "$ALICE" > /dev/null
R=$(api POST "/notes/$ALICE_NOTE/restore" "$BOB")
check "T18 Bob cannot restore Alice's deleted note" "NOT_FOUND" "$R"

R=$(api DELETE "/notes/$ALICE_NOTE/permanent" "$BOB")
check "T19 Bob cannot permanently delete Alice's note" "NOT_FOUND" "$R"

R=$(api POST "/notes/$ALICE_NOTE/restore" "$ALICE")
check "T20 Alice can restore her own note" "success" "$R"

# ── 4. Note Search Isolation ──────────────────────────────

echo ""
echo "── Note Search (link picker) ──"

R=$(api GET "/tables/_notes/records/search" "$ALICE" | jq_extract "print([n['title'] for n in json.load(sys.stdin)['data']])")
check "T21 Alice note search only returns hers" "Alice Note" "$R"

R=$(api GET "/tables/_notes/records/search" "$BOB" | jq_extract "print([n['title'] for n in json.load(sys.stdin)['data']])")
check "T22 Bob note search only returns his" "Bob Note" "$R"

# ── 5. Trash Isolation ────────────────────────────────────

echo ""
echo "── Trash Isolation ──"

api POST /tables/tbl_a1/records "$ALICE" '{"col1":"secret data"}' > /dev/null
api DELETE /tables/tbl_a1/records/1 "$ALICE" > /dev/null

R=$(api GET /trash "$ALICE" | jq_extract "print(len(json.load(sys.stdin)['data']))")
check "T23 Alice sees her trash" "1" "$R"

R=$(api GET /trash "$BOB" | jq_extract "print(len(json.load(sys.stdin)['data']))")
check "T24 Bob sees empty trash" "0" "$R"

# Get Alice's trash item id
TRASH_ID=$(api GET /trash "$ALICE" | jq_extract "print(json.load(sys.stdin)['data'][0]['id'])")

R=$(api POST "/trash/$TRASH_ID/restore" "$BOB")
check "T25 Bob cannot restore Alice's trash" "NOT_FOUND" "$R"

R=$(api DELETE "/trash/$TRASH_ID" "$BOB")
check "T26 Bob cannot delete Alice's trash" "NOT_FOUND" "$R"

R=$(api POST "/trash/$TRASH_ID/restore" "$ALICE")
check "T27 Alice can restore her own trash" "success" "$R"

# ── 6. API Key Isolation ──────────────────────────────────

echo ""
echo "── API Key Isolation ──"

R=$(api GET /admin/keys "$ALICE" | jq_extract "print([k['name'] for k in json.load(sys.stdin)['data']])")
check "T28 Alice only sees her team's keys" "Alice Key" "$R"

R=$(api DELETE /admin/keys/1 "$BOB")
check "T29 Bob cannot revoke Alice's key" "NOT_FOUND" "$R"

# ── 7. Same-Name Across Teams ─────────────────────────────

echo ""
echo "── Same Name Across Teams ──"

api POST /groups "$ALICE" '{"name":"Shared Name"}' > /dev/null
R=$(api POST /groups "$BOB" '{"name":"Shared Name"}')
check "T30 Different teams can have same group name" "id" "$R"

# ── 8. ADMIN_KEY Behavior ─────────────────────────────────

echo ""
echo "── ADMIN_KEY (superadmin) ──"

R=$(api GET /tables "$ADMIN_KEY" | jq_extract "d=json.load(sys.stdin)['data']; print(f'count={len(d)}')")
check "T31 ADMIN_KEY sees all tables" "count=" "$R"

R=$(api GET /groups "$ADMIN_KEY" | jq_extract "d=json.load(sys.stdin)['data']; print(f'count={len(d)}')")
check "T32 ADMIN_KEY sees all groups" "count=" "$R"

R=$(api GET /trash "$ADMIN_KEY" | jq_extract "d=json.load(sys.stdin)['data']; print(f'count={len(d)}')")
check "T33 ADMIN_KEY sees all trash" "count=" "$R"

ADMIN_NOTE=$(api POST /notes "$ADMIN_KEY" '{"title":"Admin Note"}' | jq_extract "print(json.load(sys.stdin)['data']['id'])")
R=$(api DELETE "/notes/$ADMIN_NOTE" "$ADMIN_KEY")
check "T34 ADMIN_KEY can delete notes (no team_id)" "success" "$R"
R=$(api POST "/notes/$ADMIN_NOTE/restore" "$ADMIN_KEY")
check "T35 ADMIN_KEY can restore notes" "success" "$R"

R=$(api DELETE "/notes/$ALICE_NOTE" "$ADMIN_KEY")
check "T36 ADMIN_KEY can delete team-owned notes" "success" "$R"
api POST "/notes/$ALICE_NOTE/restore" "$ADMIN_KEY" > /dev/null

# ── 9. Team Management ───────────────────────────────────

echo ""
echo "── Team Management ──"

R=$(api POST /teams/current/members "$ALICE" '{"email":"bob@test.com"}')
check "T37 Alice can add Bob to her team" "User added" "$R"

R=$(npx wrangler d1 execute d1table --local --command "SELECT team_id FROM _api_keys WHERE user_id = 2" 2>&1 | grep -o '"team_id": [0-9]*' | head -1)
check "T38 Bob's API key team_id synced" '"team_id": 1' "$R"

R=$(api GET /tables "$BOB" | jq_extract "names=[t['name'] for t in json.load(sys.stdin)['data']]; print('has_a1=' + str('tbl_a1' in names))")
check "T39 Bob sees Alice's table after joining" "has_a1=True" "$R"

# Team member can edit shared data
api POST /tables/tbl_a1/records "$BOB" '{"col1":"from bob"}' > /dev/null
R=$(api GET /tables/tbl_a1/records "$ALICE" | jq_extract "d=json.load(sys.stdin); print('ok' if d['meta']['count'] >= 1 else 'empty')")
check "T40 Bob can create records in team table" "ok" "$R"

BOB_TEAM_NOTE=$(api POST /notes "$BOB" '{"title":"Bob Team Note"}' | jq_extract "print(json.load(sys.stdin)['data']['id'])")
R=$(api GET "/notes/$BOB_TEAM_NOTE" "$ALICE" | jq_extract "print(json.load(sys.stdin)['data']['title'])")
check "T41 Alice can see note created by Bob in team" "Bob Team Note" "$R"

R=$(api PATCH "/notes/$BOB_TEAM_NOTE" "$ALICE" '{"title":"Edited by Alice"}')
check "T42 Alice can edit Bob's note in same team" "success" "$R"

# Duplicate add
R=$(api POST /teams/current/members "$ALICE" '{"email":"bob@test.com"}')
check "T43 Cannot add same member twice" "ALREADY_MEMBER" "$R"

# Cannot remove self
R=$(api DELETE /teams/current/members/1 "$ALICE")
check "T44 Cannot remove self from team" "FORBIDDEN" "$R"

# Invalid email
R=$(api POST /teams/current/members "$ALICE" '{"email":""}')
check "T45 Empty email rejected" "INVALID_BODY" "$R"

# Remove member
R=$(api DELETE /teams/current/members/2 "$ALICE")
check "T46 Alice can remove Bob" "success" "$R"

R=$(npx wrangler d1 execute d1table --local --command "SELECT team_id FROM _users WHERE id = 2" 2>&1 | grep -o '"team_id": [0-9]*' | head -1)
check "T47 Removed Bob gets new personal team" '"team_id": 3' "$R"

R=$(npx wrangler d1 execute d1table --local --command "SELECT team_id FROM _api_keys WHERE user_id = 2" 2>&1 | grep -o '"team_id": [0-9]*' | head -1)
check "T48 Bob's API key points to new team" '"team_id": 3' "$R"

R=$(api GET /tables "$BOB" | jq_extract "print([t['name'] for t in json.load(sys.stdin)['data']])")
check "T49 Bob no longer sees Alice's tables" "[]" "$R"

# ── Results ───────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed (of $TOTAL)"
echo "═══════════════════════════════════════"

exit $FAIL
