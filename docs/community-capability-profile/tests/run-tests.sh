#!/usr/bin/env bash
# Runs the Community Capability Profile migrations and privacy tests against a
# throwaway local PostgreSQL cluster. Never touches Supabase.
#   docs/community-capability-profile/tests/run-tests.sh   (needs initdb/pg_ctl/psql)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${CCP_TEST_PG_PORT:-54333}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ccp-tests-XXXXXX")"
cleanup() {
  pg_ctl -D "$WORK/data" -m fast stop >/dev/null 2>&1 || true
  case "$WORK" in */ccp-tests-*) rm -rf "$WORK" ;; esac
}
trap cleanup EXIT

initdb -D "$WORK/data" -U postgres -A trust >/dev/null
pg_ctl -D "$WORK/data" -l "$WORK/log" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null

PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1 -d postgres)
"${PSQL[@]}" -f "$HERE/fixture-baseline.sql"
"${PSQL[@]}" -f "$HERE/../sql/001_discovery_consent.sql"
"${PSQL[@]}" -f "$HERE/../sql/002_capability_profile_snapshot.sql"
# Migrations must be re-runnable.
"${PSQL[@]}" -f "$HERE/../sql/001_discovery_consent.sql"
"${PSQL[@]}" -f "$HERE/../sql/002_capability_profile_snapshot.sql"
"${PSQL[@]}" -f "$HERE/profile-privacy-tests.sql" -o /dev/null 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
# Optional: save the final snapshot for schema validation.
if [ -n "${CCP_SNAPSHOT_OUT:-}" ]; then
  "${PSQL[@]}" -At -c "SELECT public.get_community_capability_snapshot()" > "$CCP_SNAPSHOT_OUT"
fi
