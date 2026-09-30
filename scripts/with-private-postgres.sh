#!/usr/bin/env bash
# with-private-postgres.sh COMMAND [ARGS...]
#
# Runs COMMAND against a throwaway database of its own on the development
# Postgres server (`compose.yaml`: 127.0.0.1:5433, taverns/taverns), so a suite
# never reads or writes the `taverns` database `pnpm dev` uses.
#
# - Expects that server to be running already (`pnpm db:up`) and fails saying so
#   when it is not.
# - Creates `taverns_gate_<random>` through the maintenance database `postgres`,
#   then runs COMMAND with DATABASE_URL and E2E_AUTH_DATABASE_URL pointing at it
#   and TAVERNS_TEST_DATABASE_PREFIX set to its name, so the server suite's
#   per-file databases are named under it and cannot collide with anybody
#   else's (`apps/server/test/support/database.ts`). Exits with COMMAND's status.
# - On success, failure or a signal, stops COMMAND's process group (by the PID
#   recorded at spawn), then drops its database and every `<its name>_*` one.
#
# TAVERNS_PG_HOST, TAVERNS_PG_PORT, TAVERNS_PG_USER and TAVERNS_PG_PASSWORD
# point it at another server; they default to the compose one.

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/with-private-postgres.sh COMMAND [ARGS...]" >&2
  exit 64
fi

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
host=${TAVERNS_PG_HOST:-127.0.0.1}
port=${TAVERNS_PG_PORT:-5433}
user=${TAVERNS_PG_USER:-taverns}
password=${TAVERNS_PG_PASSWORD:-taverns}

# admin ACTION NAME: create or drop NAME (and, for drop, every NAME_* database)
# through the maintenance database, with the workspace's own `pg`; the
# server image ships psql, but the host may not have it.
admin() {
  PGHOST_="$host" PGPORT_="$port" PGUSER_="$user" PGPASSWORD_="$password" \
    node -e '
      const [root, action, name] = process.argv.slice(1);
      const pg = require(require.resolve("pg", { paths: [root + "/apps/web"] }));
      const env = process.env;
      const where = `${env.PGHOST_}:${env.PGPORT_}`;
      const client = new pg.Client({
        host: env.PGHOST_, port: Number(env.PGPORT_), user: env.PGUSER_,
        password: env.PGPASSWORD_, database: "postgres", connectionTimeoutMillis: 5000,
      });
      const quote = (n) => `"${n.replaceAll("\"", "\"\"")}"`;
      (async () => {
        try {
          await client.connect();
        } catch (error) {
          console.error(`with-private-postgres: Postgres is not reachable at ${where} (${error.message}).`);
          console.error("  Start the development database with `pnpm db:up`, or point TAVERNS_PG_HOST and");
          console.error("  TAVERNS_PG_PORT at another Postgres server.");
          process.exit(69);
        }
        try {
          if (action === "create") {
            await client.query(`create database ${quote(name)}`);
          } else {
            const { rows } = await client.query(
              "select datname from pg_database where datname = $1 or left(datname, length($1) + 1) = $1 || $2",
              [name, "_"],
            );
            for (const { datname } of rows) await client.query(`drop database if exists ${quote(datname)} with (force)`);
          }
        } finally {
          await client.end();
        }
      })().catch((error) => {
        console.error(`with-private-postgres: could not ${action} ${name} on ${where}: ${error.message}`);
        process.exit(70);
      });
    ' "$root" "$1" "$2"
}

# True while any live process remains in COMMAND's process group.
group_alive() {
  local stat line
  for stat in /proc/[0-9]*/stat; do
    read -r line 2>/dev/null <"$stat" || continue
    [[ ${line##*) } =~ ^([A-Za-z])\ -?[0-9]+\ ([0-9]+)\  ]] || continue
    [ "${BASH_REMATCH[2]}" = "$cmd_pid" ] && [ "${BASH_REMATCH[1]}" != Z ] && return 0
  done
  return 1
}

# COMMAND leads a process group of its own, whose id is the PID recorded at
# spawn, so everything it started is stopped with it and nothing else is.
stop_command() {
  [ -n "$cmd_pid" ] || return 0
  if group_alive; then
    kill -TERM -- -"$cmd_pid" 2>/dev/null || true
    for _ in $(seq 1 100); do
      group_alive || break
      sleep 0.1
    done
    if group_alive; then
      echo "with-private-postgres: command group $cmd_pid ignored SIGTERM for 10 s; killing it." >&2
      kill -KILL -- -"$cmd_pid" 2>/dev/null || true
    fi
  fi
  wait "$cmd_pid" 2>/dev/null || true
  cmd_pid=""
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM HUP
  stop_command
  if [ -n "$database" ]; then
    admin drop "$database" ||
      echo "with-private-postgres: $database and its ${database}_* databases may be left on $host:$port." >&2
  fi
  exit "$status"
}

database=""
cmd_pid=""
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Recorded before the create, so a signal that lands while it runs (bash
# defers the trap until node exits) still drops the database node went on to
# make. Only when the server was never reached (69) is there nothing to drop.
database="taverns_gate_$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
admin create "$database" || {
  status=$?
  [ "$status" -ne 69 ] || database=""
  exit "$status"
}

url="postgres://$(node -p 'encodeURIComponent(process.argv[1]) + ":" + encodeURIComponent(process.argv[2])' "$user" "$password")@$host:$port/$database"
export DATABASE_URL="$url"
export E2E_AUTH_DATABASE_URL="$url"
export TAVERNS_TEST_DATABASE_PREFIX="$database"
echo "with-private-postgres: database $database on $host:$port" >&2

# In the background so a signal to this script is handled at once rather than
# after COMMAND ends; stdin is passed through explicitly, since a background
# job would otherwise read /dev/null. setsid makes COMMAND the leader of a new
# process group (a fresh child is never one already, so setsid does not fork).
setsid "$@" <&0 &
cmd_pid=$!
status=0
wait "$cmd_pid" || status=$?
exit "$status"
