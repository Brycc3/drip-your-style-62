#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
if [[ "$mode" != "fresh" && "$mode" != "existing-upgrade" ]]; then
  echo "usage: $0 fresh|existing-upgrade" >&2
  exit 2
fi

weak_version="20260730025301"
weak_file="supabase/migrations/${weak_version}_cb455320-3ddc-42d0-894e-6a7e610dcc9b.sql"
phase4_version="20260802010000"
phase4_file="supabase/migrations/${phase4_version}_phase_4a_reconciliation_and_real_catalog_imports.sql"
compatibility_file="supabase/compatibility/${weak_version}_clean_replay.sql"
expected_weak_hash="b78d464dc0feb701692ae1b03eed3aba5d8f5985a48da29f90856ef4ddbe8de1"
holding_dir="$(mktemp -d)"
database_started=false

restore_migrations() {
  [[ -f "$holding_dir/$(basename "$weak_file")" ]] && mv "$holding_dir/$(basename "$weak_file")" "$weak_file"
  [[ -f "$holding_dir/$(basename "$phase4_file")" ]] && mv "$holding_dir/$(basename "$phase4_file")" "$phase4_file"
}

cleanup() {
  restore_migrations
  if [[ "$database_started" == true ]]; then
    supabase stop --no-backup >/dev/null 2>&1 || true
  fi
  rmdir "$holding_dir" 2>/dev/null || true
}
trap cleanup EXIT

actual_weak_hash="$(shasum -a 256 "$weak_file" | awk '{print $1}')"
test "$actual_weak_hash" = "$expected_weak_hash"

# Supabase start automatically replays every visible migration on a new local
# volume. Hold the two post-Pass-3 migrations aside so the compatibility
# boundary can be exercised explicitly without changing migration timestamps.
mv "$weak_file" "$holding_dir/"
mv "$phase4_file" "$holding_dir/"
supabase start
database_started=true
supabase db reset --local
restore_migrations

database_container="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -n 1)"
test -n "$database_container"
psql_local=(docker exec -i "$database_container" psql -U postgres -d postgres -v ON_ERROR_STOP=1)

"${psql_local[@]}" -1 < "$compatibility_file"
"${psql_local[@]}" -1 < "$weak_file"
supabase migration repair "$weak_version" --status applied --local

if [[ "$mode" == "existing-upgrade" ]]; then
  test "$("${psql_local[@]}" -Atc "SELECT pg_get_function_result('public.attach_problem_report_screenshot(uuid,text)'::regprocedure)")" = "boolean"
fi

supabase migration up --local

expected_history="$(find supabase/migrations -maxdepth 1 -name '*.sql' -exec basename {} \; | sed 's/_.*//' | sort)"
actual_history="$("${psql_local[@]}" -Atc 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version')"
test "$actual_history" = "$expected_history"
test "$("${psql_local[@]}" -Atc "SELECT pg_get_function_result('public.attach_problem_report_screenshot(uuid,text)'::regprocedure)")" = "void"

"${psql_local[@]}" < supabase/tests/phase-4a-integration.sql
node scripts/render-product-url-fixtures-sql.mjs | "${psql_local[@]}"

local_status="$(supabase status -o env)"
api_url="$(sed -n 's/^API_URL="\(.*\)"$/\1/p' <<< "$local_status")"
anon_key="$(sed -n 's/^ANON_KEY="\(.*\)"$/\1/p' <<< "$local_status")"
jwt_secret="$(sed -n 's/^JWT_SECRET="\(.*\)"$/\1/p' <<< "$local_status")"
test -n "$api_url" && test -n "$anon_key" && test -n "$jwt_secret"
deletion_user="f4000000-0000-4000-8000-000000000003"
test_jwt="$(LOCAL_SUPABASE_JWT_SECRET="$jwt_secret" node scripts/create-local-supabase-jwt.mjs "$deletion_user")"
report_id="$("${psql_local[@]}" -Atc "SELECT id FROM public.content_reports WHERE details = 'account deletion screenshot fixture'")"
imported_batch="$("${psql_local[@]}" -Atc "SELECT id FROM public.catalog_import_batches WHERE source_name = 'account import'")"
imported_row="$("${psql_local[@]}" -Atc "SELECT id FROM public.catalog_import_rows WHERE batch_id = '$imported_batch'")"
draft_batch="$("${psql_local[@]}" -Atc "SELECT id FROM public.catalog_import_batches WHERE source_name = 'account draft'")"
draft_row="$("${psql_local[@]}" -Atc "SELECT id FROM public.catalog_import_rows WHERE batch_id = '$draft_batch'")"
test -n "$report_id" && test -n "$imported_row" && test -n "$draft_row"

report_path="$deletion_user/$report_id/f4200000-0000-4000-8000-000000000001.png"
draft_path="drafts/$deletion_user/$draft_batch/$draft_row/f4200000-0000-4000-8000-000000000002.jpg"
imported_path="drafts/$deletion_user/$imported_batch/$imported_row/f4200000-0000-4000-8000-000000000003.jpg"
storage_env=(
  "LOCAL_SUPABASE_URL=$api_url"
  "LOCAL_SUPABASE_ANON_KEY=$anon_key"
  "LOCAL_SUPABASE_USER_JWT=$test_jwt"
)

env "${storage_env[@]}" node scripts/local-storage-api.mjs upload reports "$report_path" image/png
env "${storage_env[@]}" node scripts/local-storage-api.mjs upload catalog-products "$draft_path" image/jpeg
env "${storage_env[@]}" node scripts/local-storage-api.mjs upload catalog-products "$imported_path" image/jpeg

"${psql_local[@]}" < supabase/tests/phase-4a-account-deletion.sql

env "${storage_env[@]}" node scripts/local-storage-api.mjs remove reports "$report_path"
env "${storage_env[@]}" node scripts/local-storage-api.mjs remove catalog-products "$draft_path"

"${psql_local[@]}" < supabase/tests/phase-4a-storage-cleanup-finalize.sql

echo "Phase 4A database path passed: $mode"
