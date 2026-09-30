#!/usr/bin/env bash
# with-private-postgres.sh COMMAND [ARGS...]
#
# Runs COMMAND against a throwaway Postgres of its own, so a suite never needs,
# and never reaches, the development database on 5433 (`compose.yaml`).
#
# - Starts Postgres 18 from the pinned `@embedded-postgres/linux-x64`
#   devDependency (CI's service is `postgres:18`) on a free loopback port that
#   is never 5433, with its data under `.scratch/` in this checkout (not /tmp,
#   whose quota is shared by every session on the machine).
# - Runs COMMAND with DATABASE_URL and E2E_AUTH_DATABASE_URL set to it, whatever
#   they were before, and exits with COMMAND's status.
# - On success, failure or a signal, stops exactly the postmaster it started
#   (its own child, by the PID it recorded at spawn) and deletes the data.
#
# Linux x64 only, like the binaries. No Docker, no client tools.

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/with-private-postgres.sh COMMAND [ARGS...]" >&2
  exit 64
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
native="$root/node_modules/@embedded-postgres/linux-x64/native"
if [ ! -x "$native/bin/postgres" ]; then
  echo "with-private-postgres: no Postgres binaries at $native; run pnpm install (Linux x64 only)." >&2
  exit 69
fi

mkdir -p "$root/.scratch"
work=$(mktemp -d "$root/.scratch/pg.XXXXXX")
pg_pid=""
cmd_pid=""

# npm cannot ship symlinks, and the binaries load libicu*.so.60 by those names.
# Recreate the links the package lists, here rather than in node_modules.
mkdir "$work/lib"
node -e '
  const [lib, native] = process.argv.slice(1);
  const fs = require("fs"), path = require("path");
  for (const { source, target } of require(path.join(native, "pg-symlinks.json")))
    fs.symlinkSync(path.join(native, "..", source), path.join(lib, path.basename(target)));
' "$work/lib" "$native"
export LD_LIBRARY_PATH="$work/lib:$native/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# True while $1, a child of this shell, is running (a zombie counts as gone).
alive() {
  local state
  state=$(awk '{ print $3 }' "/proc/$1/stat" 2>/dev/null) || return 1
  [ "$state" != "Z" ]
}

stop_postgres() {
  [ -n "$pg_pid" ] || return 0
  if alive "$pg_pid"; then
    kill -INT "$pg_pid" 2>/dev/null || true # fast shutdown
    for _ in $(seq 1 300); do
      alive "$pg_pid" || break
      sleep 0.1
    done
    if alive "$pg_pid"; then
      echo "with-private-postgres: postmaster $pg_pid ignored fast shutdown for 30 s; killing it." >&2
      kill -KILL "$pg_pid" 2>/dev/null || true
    fi
  fi
  # Reap it. Until this the PID cannot be reused, so every signal above
  # reached the process this script started and nothing else.
  wait "$pg_pid" 2>/dev/null || true
  pg_pid=""
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM HUP
  if [ -n "$cmd_pid" ]; then
    kill -TERM "$cmd_pid" 2>/dev/null || true
    wait "$cmd_pid" 2>/dev/null || true
  fi
  stop_postgres
  rm -rf "$work"
  rmdir "$root/.scratch" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

printf 'taverns\n' >"$work/pwfile"
locale=C.UTF-8
if locale -a 2>/dev/null | grep -qix 'en_US.utf-\?8'; then locale=en_US.UTF-8; fi
"$native/bin/initdb" -D "$work/data" -U taverns --pwfile="$work/pwfile" \
  -A scram-sha-256 -E UTF8 --locale="$locale" --no-sync >"$work/initdb.log" 2>&1 ||
  { cat "$work/initdb.log" >&2; exit 70; }
echo "CREATE DATABASE taverns" |
  "$native/bin/postgres" --single -D "$work/data" -F postgres >"$work/single.log" 2>&1 ||
  { cat "$work/single.log" >&2; exit 70; }

# A free port, never 5433. Another process can take it between the check and
# the bind, so a failed start picks again.
pick_port() {
  local port
  for _ in $(seq 1 50); do
    port=$((20000 + RANDOM % 40000))
    [ "$port" -ne 5433 ] || continue
    if [ -z "$(ss -Htln "sport = :$port" 2>/dev/null)" ]; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

port=""
for _ in $(seq 1 5); do
  port=$(pick_port) || { echo "with-private-postgres: no free port found." >&2; exit 70; }
  "$native/bin/postgres" -D "$work/data" -h 127.0.0.1 -p "$port" -k '' \
    -c max_connections=400 -c fsync=off -c synchronous_commit=off -c full_page_writes=off \
    >"$work/postgres.log" 2>&1 &
  pg_pid=$!
  # postmaster.pid's eighth line reads "ready" once connections are accepted.
  for _ in $(seq 1 600); do
    alive "$pg_pid" || break
    [ "$(sed -n 8p "$work/data/postmaster.pid" 2>/dev/null | tr -d ' ')" = ready ] && break
    sleep 0.1
  done
  if alive "$pg_pid" && [ "$(sed -n 8p "$work/data/postmaster.pid" 2>/dev/null | tr -d ' ')" = ready ]; then
    break
  fi
  stop_postgres
  if ! grep -q 'could not bind\|Address already in use' "$work/postgres.log"; then
    cat "$work/postgres.log" >&2
    exit 70
  fi
  port=""
done
[ -n "$port" ] || { echo "with-private-postgres: Postgres did not start." >&2; exit 70; }

export DATABASE_URL="postgres://taverns:taverns@127.0.0.1:$port/taverns"
export E2E_AUTH_DATABASE_URL="$DATABASE_URL"
echo "with-private-postgres: Postgres $pg_pid on 127.0.0.1:$port, data in ${work#"$root"/}" >&2

# In the background so a signal to this script is handled at once rather than
# after COMMAND ends; stdin is passed through explicitly, since a background
# job would otherwise read /dev/null.
"$@" <&0 &
cmd_pid=$!
status=0
wait "$cmd_pid" || status=$?
cmd_pid=""
exit "$status"
