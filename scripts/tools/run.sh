#!/usr/bin/env bash
# Run a command inside the tools image with the repository mounted read-only at /work.
# Interactive (-it) only when stdin is a TTY, so psql's hidden password prompt works for the owner
# and piped use (CI, checks) still runs.
set -euo pipefail

image="investments-diary-tools"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "Image $image not found. Build it first: npm run tools:build" >&2
  exit 1
fi

tty_flags=(-i)
if [ -t 0 ]; then
  tty_flags=(-it)
fi

exec docker run --rm "${tty_flags[@]}" -v "$repo_root:/work:ro" -w /work "$image" "$@"
