#!/usr/bin/env bash
set -euo pipefail

TARGET_ENV="${1:-production}"
EXECUTION_MODE="${2:-remote}"

case "$TARGET_ENV" in
  production)
    DB_NAME="d1table"
    declare -a ENV_ARGS=()
    ;;
  preview)
    DB_NAME="d1table-preview"
    declare -a ENV_ARGS=(--env preview)
    ;;
  *)
    echo "Unknown target environment: $TARGET_ENV" >&2
    exit 1
    ;;
esac

case "$EXECUTION_MODE" in
  local)
    MODE_ARG="--local"
    ;;
  remote)
    MODE_ARG="--remote"
    ;;
  *)
    echo "Unknown execution mode: $EXECUTION_MODE" >&2
    exit 1
    ;;
esac

run_d1() {
  local args=(d1 execute "$DB_NAME")
  if ((${#ENV_ARGS[@]} > 0)); then
    args+=("${ENV_ARGS[@]}")
  fi
  args+=("$MODE_ARG" "$@")
  npx wrangler "${args[@]}"
}

# 确保 _migrations 跟踪表存在
run_d1 \
  --command "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()));" \
  2>/dev/null || true

has_table() {
  local table_name="$1"
  local output
  output="$(run_d1 --command "SELECT name FROM sqlite_master WHERE type='table' AND name='$table_name';" 2>/dev/null || true)"
  [[ "$output" == *"$table_name"* ]]
}

has_column() {
  local table_name="$1"
  local column_name="$2"
  local output
  output="$(run_d1 --command "PRAGMA table_info('$table_name');" 2>/dev/null || true)"
  [[ "$output" == *"|$column_name|"* ]]
}

is_applied() {
  local migration_name="$1"
  local output
  output="$(run_d1 --command "SELECT name FROM _migrations WHERE name='$migration_name';" 2>/dev/null || true)"
  [[ "$output" == *"$migration_name"* ]]
}

for file in migrations/0*.sql; do
  migration_name="$(basename "$file")"

  # 跳过已应用的迁移
  if is_applied "$migration_name"; then
    echo "Skipping $migration_name (already applied)."
    continue
  fi

  # 特殊处理：passwords 表不存在时跳过 0018
  if [[ "$migration_name" == "0018_passwords_email.sql" ]] && ! has_table "passwords"; then
    echo "Skipping $migration_name because table passwords does not exist in $DB_NAME."
    continue
  fi

  # 兼容旧库：icon 列如果之前已手动添加，则直接标记 0009 已应用
  if [[ "$migration_name" == "0009_meta_icon.sql" ]] && has_column "_meta" "icon"; then
    echo "Skipping $migration_name because _meta.icon already exists in $DB_NAME."
    run_d1 \
      --command "INSERT OR IGNORE INTO _migrations (name) VALUES ('$migration_name');"
    continue
  fi

  echo "Applying $migration_name to $DB_NAME ($EXECUTION_MODE)..."
  run_d1 --file="$file"

  # 记录已应用
  run_d1 \
    --command "INSERT OR IGNORE INTO _migrations (name) VALUES ('$migration_name');"
done

echo "All migrations applied successfully."
