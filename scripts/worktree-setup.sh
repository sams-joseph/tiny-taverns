#!/usr/bin/env bash
# worktree-setup.sh [--force] [SOURCE]
#
# Copies the local environment files a fresh worktree lacks from another
# checkout of this repository: `apps/server/.env.local` and
# `apps/web/.env.local`. Both are gitignored (`.env.*`), so `git worktree add`
# never brings them, and without them the server boots with hosted sign-in,
# Hob and storage OFF and the web app cannot sign in.
#
# - SOURCE defaults to the main checkout (the parent of the shared git
#   directory). Run from inside the worktree to set up.
# - A file SOURCE does not have is reported and skipped.
# - A file this worktree already has is left alone when it differs, unless
#   --force, which overwrites it; an identical one is reported as present.
# - Copies are made readable by their owner alone, since they hold secrets.
#
# It copies and nothing else: no install, no database, no build.

set -euo pipefail

FILES=(apps/server/.env.local apps/web/.env.local)

force=false
source_root=""
for arg in "$@"; do
  case "$arg" in
    --force) force=true ;;
    -h | --help)
      sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "usage: scripts/worktree-setup.sh [--force] [SOURCE]" >&2
      exit 64
      ;;
    *) source_root="$arg" ;;
  esac
done

target_root=$(git rev-parse --show-toplevel)
if [ -z "$source_root" ]; then
  common=$(git rev-parse --path-format=absolute --git-common-dir)
  source_root=$(dirname "$common")
fi
source_root=$(cd "$source_root" && pwd -P)
target_root=$(cd "$target_root" && pwd -P)

if [ "$source_root" = "$target_root" ]; then
  echo "This is the checkout the files would come from ($target_root); nothing to do."
  exit 0
fi

echo "From: $source_root"
echo "To:   $target_root"

copied=0
for file in "${FILES[@]}"; do
  from="$source_root/$file"
  to="$target_root/$file"
  if [ ! -f "$from" ]; then
    echo "  skip     $file (not in the source; start from ${file%.local}.example)"
    continue
  fi
  if [ -f "$to" ]; then
    if cmp -s "$from" "$to"; then
      echo "  present  $file"
      continue
    fi
    if [ "$force" != true ]; then
      echo "  kept     $file (differs from the source; --force to overwrite)"
      continue
    fi
  fi
  mkdir -p "$(dirname "$to")"
  cp "$from" "$to"
  chmod 600 "$to"
  echo "  copied   $file"
  copied=$((copied + 1))
done

echo "$copied file(s) copied."
