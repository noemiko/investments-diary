#!/usr/bin/env bash
# Vercel "Ignored Build Step": exit 0 = skip the deploy, exit 1 = build.
# Skips when every changed file is docs-only (context/, docs/, *.md).
# Keep in sync with paths-ignore in .github/workflows/ci.yml.

base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

# If the base commit isn't in the (shallow) clone, build to be safe.
git cat-file -e "$base^{commit}" 2>/dev/null || exit 1

if git diff --quiet "$base" HEAD -- . \
  ':(exclude)context' \
  ':(exclude)docs' \
  ':(exclude)*.md'; then
  echo "Docs-only change ($base..HEAD) — skipping deploy."
  exit 0
fi

echo "Code changes detected — building."
exit 1
