#!/usr/bin/env bash
# Owner-only account creation: one confirmed email/password account, written by create-user.sql through psql.
#
#   npm run user:create -- --email <e>                                   local Supabase (default)
#   npm run user:create -- --email <e> --production --db-url <conn>      hosted project, owner only
#
# Local mode only ever talks to the local database container. Production is never inferred from the environment.
# The production database password is typed only into psql's own hidden prompt: a --db-url carrying a password is
# refused, and PGPASSWORD / ~/.pgpass are ignored. The account password reaches SQL base64-encoded over stdin.
# Neither password is ever printed. Written for bash 3.2 (macOS) and later.
#
# Production psql runs in the tools image (scripts/tools, build once with `npm run tools:build`), so no host psql is
# needed: after validating the URL, the script re-runs itself inside that container on the owner's terminal, where it
# asks for the project ref, the account password and (through psql) the database password.
set -euo pipefail

readonly CONTAINER="supabase_db_investments-diary"
readonly MIN_PASSWORD_LENGTH=12
readonly USAGE="Usage: npm run user:create -- --email <e> [--production --db-url postgresql://<user>@<host>:<port>/postgres]"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SQL_FILE="$script_dir/create-user.sql"

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

email=""
production=false
db_url=""
project_ref=""
password=""
in_tools_container=false

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --production)
        [[ "$production" == false ]] || die "Duplicate --production. $USAGE"
        production=true
        shift
        ;;
      --email | --db-url)
        [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || die "$1 needs a value. $USAGE"
        if [[ "$1" == "--email" ]]; then
          [[ -z "$email" ]] || die "Duplicate --email. $USAGE"
          email="$2"
        else
          [[ -z "$db_url" ]] || die "Duplicate --db-url. $USAGE"
          db_url="$2"
        fi
        shift 2
        ;;
      --in-tools-container)
        # Internal: set by the production hand-off below. Only selects the psql on PATH; every guard still runs.
        in_tools_container=true
        shift
        ;;
      -h | --help)
        printf '%s\n' "$USAGE"
        exit 0
        ;;
      *)
        die "Unknown argument \"$1\". $USAGE"
        ;;
    esac
  done
  [[ -n "$email" ]] || die "--email is required. $USAGE"
  [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]] || die "--email must be an email address"
  if [[ "$production" == true ]]; then
    [[ -n "$db_url" ]] || die "--production requires --db-url. $USAGE"
  else
    [[ -z "$db_url" ]] || die "--db-url is only allowed with --production. $USAGE"
  fi
}

# Accept only a Supabase connection string without a password and set project_ref from it:
#   postgresql://postgres.<ref>@<region>.pooler.supabase.com:<port>/postgres   (pooler)
#   postgresql://postgres@db.<ref>.supabase.co:5432/postgres                    (direct)
parse_db_url() {
  local url="$1" rest authority userinfo hostport host query ref
  case "$url" in
    postgresql://*) rest="${url#postgresql://}" ;;
    postgres://*) rest="${url#postgres://}" ;;
    *) die "--db-url must start with postgresql:// or postgres://" ;;
  esac
  [[ "$rest" != *[[:space:]]* ]] || die "--db-url must not contain whitespace"

  authority="${rest%%[/?]*}"
  query=""
  if [[ "$rest" == *\?* ]]; then
    query="${rest#*\?}"
  fi
  [[ "$authority" == *@* ]] || die "--db-url must name the database user (postgres.<ref>@... or postgres@...)"
  userinfo="${authority%@*}"
  hostport="${authority##*@}"

  if [[ "$userinfo" == *:* || "$query" =~ (^|&)password= ]]; then
    die "--db-url must not contain a password; psql prompts for it. Nothing was sent."
  fi
  [[ ! "$query" =~ (^|&)sslmode=(disable|allow|prefer)(&|$) ]] || die "--db-url must not weaken sslmode"

  host="$(printf '%s' "${hostport%%:*}" | tr '[:upper:]' '[:lower:]')"
  if [[ "$host" =~ ^db\.([a-z0-9]+)\.supabase\.co$ ]]; then
    ref="${BASH_REMATCH[1]}"
    [[ "$userinfo" == "postgres" || "$userinfo" == "postgres.$ref" ]] ||
      die "--db-url user must be postgres for db.<ref>.supabase.co"
  elif [[ "$host" =~ ^[a-z0-9-]+\.pooler\.supabase\.com$ ]]; then
    [[ "$userinfo" =~ ^postgres\.([a-z0-9]+)$ ]] ||
      die "--db-url user must be postgres.<project ref> for a pooler host"
    ref="${BASH_REMATCH[1]}"
  else
    die "--db-url host must be <region>.pooler.supabase.com or db.<ref>.supabase.co. Nothing was sent."
  fi
  project_ref="$ref"
}

# Sets `password`. On a terminal both entries are hidden; local mode without one reads two lines from stdin.
read_password() {
  local first="" second=""
  if [[ -t 0 ]]; then
    IFS= read -r -s -p "Password (hidden, at least $MIN_PASSWORD_LENGTH characters): " first || true
    printf '\n' >&2
    IFS= read -r -s -p "Repeat password: " second || true
    printf '\n' >&2
  else
    IFS= read -r first || [[ -n "$first" ]] || die "No password on standard input; nothing changed"
    IFS= read -r second || [[ -n "$second" ]] || die "No password confirmation on standard input; nothing changed"
  fi
  [[ ${#first} -ge $MIN_PASSWORD_LENGTH ]] || die "Password must be at least $MIN_PASSWORD_LENGTH characters; nothing changed"
  [[ "$first" == "$second" ]] || die "Passwords do not match; nothing changed"
  password="$first"
}

# psql input: the password variable first (stdin only), then the SQL file.
sql_input() {
  local pw_b64
  pw_b64="$(printf '%s' "$password" | base64 | tr -d '\n')"
  printf '\\set pw_b64 %s\n' "$pw_b64"
  cat -- "$SQL_FILE"
}

main() {
  parse_args "$@"
  [[ -r "$SQL_FILE" ]] || die "Missing $SQL_FILE"

  local target created
  if [[ "$production" == true ]]; then
    parse_db_url "$db_url"
    [[ -t 0 && -t 1 ]] || die "--production needs an interactive terminal; nothing was sent"
    if [[ "$in_tools_container" == false ]]; then
      command -v docker > /dev/null 2>&1 || die "docker is not installed; production mode runs psql in the tools image"
      exec "$script_dir/../tools/run.sh" bash /work/scripts/accounts/create-user.sh \
        --in-tools-container --production --db-url "$db_url" --email "$email"
    fi
    local typed=""
    IFS= read -r -p "Type the project ref $project_ref to confirm: " typed || true
    [[ "$typed" == "$project_ref" ]] || die "Project ref did not match; nothing was sent"
    command -v psql > /dev/null 2>&1 || die "psql is not available in the tools image; rebuild it with npm run tools:build"
    read_password
    target="$project_ref"
    # The database password comes only from psql's own prompt (--password), never from env or a password file.
    unset PGPASSWORD
    if ! created="$(sql_input | PGPASSFILE=/dev/null PGSSLMODE=require psql "$db_url" --password -X -A -t -q \
      -v ON_ERROR_STOP=1 -v email="$email")"; then
      die "Account not created on $project_ref; nothing changed"
    fi
  else
    command -v docker > /dev/null 2>&1 || die "docker is not installed; local mode needs the local Supabase stack"
    [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2> /dev/null || true)" == "true" ]] ||
      die "Local Supabase is not running (container $CONTAINER). Start it with npx supabase start"
    read_password
    target="local"
    if ! created="$(sql_input | docker exec -i "$CONTAINER" psql -U postgres -d postgres -X -A -t -q \
      -v ON_ERROR_STOP=1 -v email="$email")"; then
      die "Account not created on local; nothing changed"
    fi
  fi
  [[ -n "$created" ]] || die "Account creation returned no email; check the database"
  printf 'Created %s on %s\n' "$created" "$target"
}

main "$@"
