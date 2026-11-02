#!/usr/bin/env bash
# `npm run test:user-create-db`: proves Supabase Auth accepts the rows scripts/accounts/create-user.sql writes.
# Local Supabase only. Creates a throwaway account through create-user.sh, signs in through the real Auth API,
# checks the duplicate and production-URL refusals, then deletes the account (also on failure).
# Never prints passwords, keys or tokens.
set -euo pipefail

readonly CONTAINER="supabase_db_investments-diary"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
readonly CREATE_USER="$repo_root/scripts/accounts/create-user.sh"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}
pass() { printf 'PASS: %s\n' "$*"; }

status_json="$(cd "$repo_root" && npx supabase status -o json 2> /dev/null)" ||
  fail "local Supabase is not running (npx supabase start)"
api_url="$(jq -r '.API_URL // empty' <<< "$status_json")"
anon_key="$(jq -r '.ANON_KEY // empty' <<< "$status_json")"
unset status_json
[[ "$api_url" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$ ]] || fail "refusing non-local Supabase API URL"
[[ -n "$anon_key" ]] || fail "local anon key unavailable"

email="user-create-check-$(date +%s)-$$@example.com"
password="$(od -An -tx1 -N16 /dev/urandom | tr -d ' \n')"
work_dir="$(mktemp -d)"

count_accounts() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -A -t -q -v ON_ERROR_STOP=1 -v email="$email" \
    <<< "select count(*) from auth.users where lower(email) = lower(:'email');"
}

cleanup() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -v email="$email" \
    <<< "delete from auth.users where lower(email) = lower(:'email');" > /dev/null 2>&1 || true
  rm -rf -- "$work_dir"
}
trap cleanup EXIT

# 1. Create through the real entry point, password fed over stdin.
printf '%s\n%s\n' "$password" "$password" | bash "$CREATE_USER" --email "$email" > "$work_dir/create.out" ||
  fail "create-user.sh exited non-zero"
[[ "$(< "$work_dir/create.out")" == "Created $email on local" ]] || fail "unexpected create output"
pass "created a confirmed account on local"

# 2. Sign in through Supabase Auth. The body goes over stdin so the password stays off the command line.
printf '{"email":"%s","password":"%s"}' "$email" "$password" |
  curl -sS -o "$work_dir/token.json" -X POST "$api_url/auth/v1/token?grant_type=password" \
    -H "apikey: $anon_key" -H "Content-Type: application/json" --data-binary @- ||
  fail "sign-in request failed"
jq -e '(.access_token | type) == "string" and (.access_token | length) > 0' "$work_dir/token.json" > /dev/null ||
  fail "Auth refused the created account ($(jq -r '.error_code // .code // "no access token"' "$work_dir/token.json" 2> /dev/null))"
pass "signed in through /auth/v1/token with the anon key"

# 3. A second run with the same email (different case) is refused and changes nothing.
upper_email="$(printf '%s' "$email" | tr '[:lower:]' '[:upper:]')"
if printf '%s\n%s\n' "$password" "$password" | bash "$CREATE_USER" --email "$upper_email" \
  > /dev/null 2> "$work_dir/duplicate.err"; then
  fail "duplicate email was accepted"
fi
grep -q "already exists" "$work_dir/duplicate.err" || fail "duplicate refusal had an unexpected message"
[[ "$(count_accounts)" == "1" ]] || fail "duplicate run changed auth.users"
pass "duplicate email refused (case-insensitive), nothing changed"

# 4. Bad production URLs are refused before any connection: psql and docker stubs record any invocation.
mkdir -p "$work_dir/bin"
for tool in psql docker; do
  printf '#!/usr/bin/env bash\ntouch "%s/tool-called"\nexit 1\n' "$work_dir" > "$work_dir/bin/$tool"
  chmod +x "$work_dir/bin/$tool"
done
expect_refused() {
  local label="$1" url="$2" message="$3"
  if PATH="$work_dir/bin:$PATH" bash "$CREATE_USER" --email "$email" --production --db-url "$url" \
    < /dev/null > /dev/null 2> "$work_dir/production.err"; then
    fail "$label was accepted"
  fi
  grep -q -- "$message" "$work_dir/production.err" || fail "$label refused with an unexpected message"
  [[ ! -e "$work_dir/tool-called" ]] || fail "$label reached psql or docker"
  pass "$label refused before connecting"
}
expect_refused "non-Supabase --db-url host" "postgresql://postgres.abc@evil.test:5432/postgres" "host must be"
expect_refused "--db-url with a password" \
  "postgresql://postgres.abcdefghijklmnopqrst:not-a-real-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" \
  "must not contain a password"
expect_refused "--production without a terminal" \
  "postgresql://postgres.abcdefghijklmnopqrst@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" \
  "interactive terminal"

# 5. Cleanup.
cleanup
trap - EXIT
work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
[[ "$(count_accounts)" == "0" ]] || fail "throwaway account was not deleted"
pass "throwaway account deleted"
