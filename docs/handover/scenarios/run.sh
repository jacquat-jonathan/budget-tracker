#!/bin/bash
# Runs reviewer scenarios against the local database: head.sql + <name>.sql + rollback.
#
#   npx supabase db start
#   npx supabase test db supabase/tests/database/00_helpers.test.sql   # installs the tests schema
#   docs/handover/scenarios/run.sh w2_weekend_lost n1_starts_seq_reopen w3_weekend_first
#
# Everything a scenario does is rolled back. DB can be overridden: DB=postgresql://... run.sh <name>
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${DB:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
for n in "$@"; do
  echo "=== $n"
  (cat "$DIR/head.sql" "$DIR/$n.sql"; echo 'rollback;') \
    | PGOPTIONS="-c search_path=public,extensions" psql -q "$DB" -f - 2>&1 | grep -v '^$'
done
