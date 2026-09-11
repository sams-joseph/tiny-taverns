# The live session

This page covers a night at the table: what is durable, how a browser hears about a change, how a fight is started, ended and carried across nights, how the recap is assembled, and what a player may know about a fight in progress. Which rows an actor may reach is [Visibility](visibility.md); where a hit point lives is [Characters](characters.md); the runner's atoms and stream hook are [Web data](web-data.md).

## Durable state, and a doorbell for fan-out

Live state is written straight through to Postgres, transactionally. There is no in-memory copy of a fight, no write-behind and no cache: the promise that matters is the one kept through a crash mid-combat, and a four-hour session is on the order of a thousand writes. Do not add a cache; measure first.

The fan-out carries no data. `apps/server/src/live/LiveEvents.ts` publishes `{ sessionId }` and nothing else, and every subscriber re-reads the log through the ordinary SQL predicate when it rings. That buys three things: visibility stays in SQL, so there is no in-memory `filter` to forget; a dropped notification self-heals on the next re-read from the same cursor; and reconnect is not a separate code path, because catching up and tailing live are one query.

The `PubSub` is `sliding`, so a frozen tab costs latency rather than server memory. In-process fan-out is the one hosting constraint: one server process per live session. Swapping this module for Postgres `LISTEN`/`NOTIFY` lifts it with no schema change.

## The reconnect contract

Any live client must implement this against `GET …/runs/:runId/events` (`handlers.ts`, group `live`):

- Every event carries `session_event.seq` as its SSE `id:` line. `HttpApiSchema.StreamSse` is given the codec in `events` mode, not `data` mode; `data` mode hard-codes the id to `undefined` and the name to `message` (`packages/api/src/SessionEvent.ts`).
- Resume with `?since=<seq>`, exclusive. The derived client issues a plain `fetch`, which does not resend `Last-Event-ID`; the header is honoured too, for a native `EventSource`.
- Heartbeats carry no `id`, so a quiet connection never overwrites the client's cursor. The interval is `LIVE_HEARTBEAT_SECONDS` (`Config.ts`, default 20, under what an idle connection survives through a proxy).
- `GET …/log?since=` is the same query over a non-streaming transport.
- Authorization happens before a stream exists, so a denial is a JSON 404 rather than a failure event inside a 200.

`seq` comes from one global sequence (`session_event_seq`), not `max(seq)+1` per session: a cursor only has to increase. It is `bigint`, so `pg` returns a string and the mapper narrows it once. `payload` is the human-legible remainder, not a contract; a client re-reads rows rather than applying it.

## Modelling decisions

- The turn marker is `encounter_run.active_combatant_id`, a pointer, not an index. Adding, removing and rerolling reorder the list, after which an index silently names a different creature.
- There is no `player_view_enabled`. `encounter_run.visibility` is the share switch and `combatant.visibility` is hide-from-players. Both default to `dm`.
- Hit points reaching zero set the number and nothing else: no delete, no invented condition, no turn advance.
- A combatant snapshots every displayable field at seed time; `character_id` / `creature_id` are `on delete set null` and read by nothing. `encounter_run.encounter_name` is snapshotted too: it is what the fight was called that night, not what the template is called now.
- One live fight per session is `encounter_run_one_live_per_session`, a partial unique index on `(session_id) where ended_at is null`. `session.active_encounter_run_id` names it, is written only by starting and ending a run, and `session_active_encounter_run_fkey` is composite so a session cannot point at another session's fight.
- Idempotency is `session_event_request_id_key`, a partial unique index on `(encounter_run_id, request_id)`; `requestAlreadyApplied` returns current state on a repeat.
- `created_at` does not order rows inserted by one transaction: `now()` is transaction start, so seeded combatants share a timestamp and `initiativeOrder`'s tiebreak falls through to `id`.

## Containment: `combatant → encounter_run → session → campaign`

`repo/visibility.ts` has a `Containment` chain the predicate walks recursively. Checking "the session is readable" and "the run is readable" as two separate questions is a hole: both are satisfied by a run in a different session of the same campaign, and the pair says nothing about whether the parent in the path is the parent of the row. Use `ensureNestedRowReadable` / `ensureNestedRowWritable` (and the `ensureNestedParent*` pair), which bind the foreign key. `apps/server/test/live-session.test.ts` pins every reachable path.

## Starting: the night and the fight are two acts

A session can start over roleplay with no encounter in sight, so opening a night and putting a fight on the table are separate doors sharing one client transition, `apps/web/src/session/start.ts`. `campaign/StartSessionDialog.tsx` opens a night and stops; `campaign/StartRunDialog.tsx` puts an encounter on the table, opening a night on the way only when none is open.

`startSession` is three statements in order, and only the last is best effort: create the session, point `campaign.currentSessionId` at it (fatal, because a session nothing points at is a night the DM cannot find again), then stamp `startedAt` under `Effect.ignore`.

`startedAt` therefore belongs to the night, not the fight: a running session with `activeEncounterRunId` null is the ordinary state of an evening. The campaign's button has three states computed once by `actFor` in `campaign/CampaignChrome.tsx`, asking the session and the run separately: `run` is undefined both with no night and with a night that has nothing on the table.

## Finishing: one write, and the server owns the rest

Every surface that ends a night goes through `apps/web/src/session/finish.ts`, which sends one `PATCH … { endedAt }` and nothing else. `finish.test.tsx` drives both callers (`run/EndRunDialog.tsx`, `campaign/FinishSessionDialog.tsx`) against one stub server and compares the requests; a third surface should extend that file.

The rest is `repo/Sessions.ts`, inside the transaction that stamps `ended_at`: `releaseIfFinished` clears `campaign.current_session_id`, and `carryLiveRun` ends a fight still on the table as `carried`, clears `session.active_encounter_run_id` and appends `run-carried`. Neither lives in a dialog, because a client that forgets one recreates a bug a second client never sees.

`campaign_current_session_id_fkey` (`0006_session_finished.ts`) makes a finished current session unrepresentable: it is composite over `session.is_open` (generated, `ended_at is null`) and a constant-true generated column on the campaign, so `(id, true)` has no row to match once the session ends. It is `deferrable initially deferred` because ending and clearing are two statements. Postgres refuses `on delete set null` on a key containing a generated column, so `Sessions.remove` clears the pointer itself. `repo/Campaigns.ts` answers `Conflict` to a campaign pointed at a finished session. `session-lifecycle.test.ts` pins the invariant against raw SQL as well as the repositories.

Ending a fight is not finishing the night. `EndRunDialog` defaults to the smaller ending (`resolved`); only its switch stamps `endedAt`.

## A fight that carries across nights

A night may finish with a fight on the table, and the fight continues into the next one as a second `encounter_run` row, never a reparented one: the predecessor keeps its night with `ended_reason = 'carried'`, and the successor points back through `continued_from`. The log is the assistant's memory, and a moved row's `run-started` event would stay filed under a night it no longer claims (`0007_run_carryover.ts`).

- `EncounterRuns.resume` (`POST …/sessions/:s/runs/resume { continuedFrom }`) copies the round, visibility, provenance and every combatant. Combatant ids are generated in TypeScript before the insert, the only way the turn marker can carry: `encounter_run_active_combatant_fkey` refuses a marker naming another run's combatant, so `insert … select` could not remap it.
- Only a `carried` run may be resumed. A `resolved` one is a `Conflict`, not a 404: reopening it would put "resolved" in one recap and "resumed" in the next.
- `continued_from` cannot be a composite key: the only column both runs share is `session_id`, which would force them into the same night. Containment is `resume`'s job against `containedRowReadable`.
- `encounter_run_one_successor` stops two nights both continuing one fight; `encounter_run_reason_needs_end` keeps a live run from carrying a reason.
- The order of combatants tied on initiative does not survive a resume (fresh ids, one shared `created_at`). `carryover.test.ts` says so.

## The recap: assembled per read, never stored

`repo/Recap.ts` assembles `SessionRecap` from five sources through five existing predicates: the session, every run of the night with its combatants, all beats verbatim, ticked prep only (an unticked line is the next night's), and notes attached to an encounter one of tonight's fights was started from. Nothing is stored and no model is called in the read path. Which notes count is structural, not a timestamp window; a window is wrong whenever the DM preps at lunchtime.

A `RecapFight` is `run` plus two `RecapRunLink`s carrying the other run's session number and round, so a pause and its pickup are expressible from either end. Following `continued_from` grants no reach: the far run goes through `containedRowReadable` and comes back `null` when the actor cannot see it (`recap.test.ts`). Paused-versus-finished is `run.endedReason`, never a guess from `endedAt`; the Chronicle's round trap is in [Web screens](web-screens.md).

It is a server-side repository because it has two consumers, the Chronicle and Hob's `sessionRecap` tool; composed client-side, the assistant would write a second version.

### The player projection is a second schema on a second path

`GET …/recap` takes the `CampaignCreatorActor` proof; `GET …/recap/player` answers `PlayerSessionRecap` to any member, from the same queries. Never a field filter over the DM's type: a leak then has to be written rather than caused by a forgotten flag. `PlayerCombatant` (`packages/api/src/PlayerRecap.ts`) is a union discriminated on `kind`, so the `npc` arm has no field for an exact total and the `pc` arm keeps exact hit points. `hpBand` is computed in SQL in `repo/playerCombatant.ts`, the only place the narrow projection is spelled, and the wide columns are never selected, so there is no number in memory for a mapper to forget. Conditions come through whole; a per-condition rule would be a visibility judgement outside the predicate. The run and the four non-combat sources are not narrowed: they are already the shared rows by row-level predicate.

## The player live table

`GET /campaigns/:c/table` answers `PlayerLiveTable | null` (`packages/api/src/PlayerLive.ts`, `repo/PlayerTable.ts`). `null` is the ordinary success; the 404 is kept for a campaign the caller cannot reach at all, because a banner's absence must not be indistinguishable from a table that is not yours. Everything narrower is an absence.

- Seat proof comes first and is an active `campaign_character` row, not `combatant.character_id`. A member with no seat gets `null`.
- The order is `you | ally | npc`. Only `you` carries exact `hpCurrent`/`hpMax`/`tempHp`; `npc` carries a band; `ally` carries no total. NPC armour class is never selected.
- The encounter's name is deliberately absent. A fight on the table may be something the DM has not said yet, so attachments key on `encounterId`.
- Each visibility switch takes exactly one thing away, fail-closed: an unshared session is `null`; an unshared run is the night with `fight: null`; an unshared combatant drops the row and nulls `upNext` if it named it. That applies to a player's own row too.
- It is not gated by the creator proof: that gate is for a read whose player projection diverges from the DM's, and this read has no DM projection. A DM calling it gets the identical narrow answer, which is how "what will my players see" is one request.

The stream at `GET …/table/sessions/:s/events` is contentless: after the same authorization it emits `tick` events with a cursor and no payload, draining shared `session_event.seq`s and emitting an empty same-cursor tick when a share/hide mutation wrote no shared row, so the browser always re-reads the narrow table. The own-character roll log is `GET …/table/sessions/:s/characters/:characterId/rolls`; there is no broad player log.

Rolls are browser-submitted. `POST /campaigns/:c/rolls` (`repo/Rolls.ts`) stores the faces the browser sent, stamps `session_event.character_id`, rings the same doorbell, and refuses a player roll with no active seat for that character or no shared current night. `player-table.test.ts` and `rolls.test.ts` pin the projection, the ticks and the no-auto-seat boundary.
