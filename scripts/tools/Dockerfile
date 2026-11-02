# Owner/agent tool image: psql (matches supabase/config.toml major_version = 17), shellcheck, jq, curl, bash.
# Keeps these off the host. Build: npm run tools:build. Run: scripts/tools/run.sh <command> [args...]
FROM alpine:3.21

RUN apk add --no-cache bash curl jq shellcheck postgresql17-client

WORKDIR /work
