import { Schema } from "effect";
import { CombatantId, EncounterRunId, SessionEventId, SessionId } from "./Ids.js";
import { provenanceFields, Visibility } from "./Provenance.js";

/**
 * What happened. A closed vocabulary, because the runner and the recap both
 * branch on it — unlike `encounter.tags` or a combatant's conditions, which are
 * words the DM invents.
 */
export const SessionEventKind = Schema.Literals([
  "run-started",
  "run-updated",
  "run-ended",
  "combatant-added",
  "combatant-updated",
  "combatant-removed",
  "combatant-damaged",
  "turn-advanced",
]);
export type SessionEventKind = typeof SessionEventKind.Type;

/**
 * One line of the append-only session log.
 *
 * Written in the same transaction as the mutation it describes — one extra
 * insert per live write, which §3.4 argues pays for itself three times: the
 * stream's reconnect replay (below), the end-of-session recap, and the
 * assistant's "what happened last session" grounding. It is **not** event
 * sourcing: the state tables stay the source of truth and this log is never
 * replayed to reconstruct them.
 *
 * Nothing updates or deletes a row here. There is no endpoint that could, and
 * the repository exposes only `list`.
 */
export class SessionEvent extends Schema.Class<SessionEvent>("SessionEvent")({
  id: SessionEventId,
  sessionId: SessionId,
  /**
   * The stream cursor, monotonically increasing within a session.
   *
   * This is what makes reconnect work: every SSE event carries it as the event
   * `id`, and a client that comes back asks for everything after the last one
   * it saw. See `TavernsApi`'s `live.events` endpoint.
   *
   * It comes from a **single global sequence**, not from `max(seq) + 1` per
   * session. Two concurrent writers reading the same maximum is a real race
   * under `read committed`, and the repair — a lock, or a retry loop around a
   * unique violation — costs more than the property it protects. A cursor only
   * has to increase; it does not have to be contiguous, and nothing counts it.
   * So the numbering has gaps wherever another session wrote in between, which
   * is invisible to every consumer.
   */
  seq: Schema.Int,
  kind: SessionEventKind,
  /** The fight this concerns, if it concerns one. Null once that run is deleted. */
  encounterRunId: Schema.NullOr(EncounterRunId),
  /** The combatant this concerns, if it concerns one. Null once they are removed. */
  combatantId: Schema.NullOr(CombatantId),
  /**
   * The details, shaped by `kind`.
   *
   * Deliberately untyped on the wire. The two ids a consumer actually filters
   * on are columns above, and the state a consumer actually renders is read
   * from the state tables — so this is the human-legible remainder ("12
   * damage", "round 4"), not a contract anything branches on. Typing it as a
   * tagged union of eight payload shapes would be a second declaration of the
   * live surface to keep in step with the first, bought for a consumer that
   * does not exist yet.
   */
  payload: Schema.Unknown,
  /**
   * Dm-only by default, like every other row in the product.
   *
   * The consequence is worth stating plainly: with no player credential in
   * existence, a player's event stream is empty. That is the fail-closed
   * answer, and the alternative — inferring shareability per kind — is a
   * visibility rule written somewhere other than the predicate, which is the
   * thing `AGENTS.md` forbids. When the player view ships, someone decides
   * per kind, in one place, on purpose.
   */
  visibility: Visibility,
  ...provenanceFields,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
}) {}

/**
 * Where to resume the log from. Exclusive: `since=7` returns 8 onwards.
 *
 * Shared by the streaming endpoint and the plain `GET` of the log, so a client
 * that cannot hold a connection open can poll the same cursor the stream uses.
 */
export const SessionLogFilter = {
  since: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2 ** 53 - 1 }))),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 }))),
} as const;

export type SessionLogFilterValues = typeof SessionLogFilterValues.Type;
const SessionLogFilterValues = Schema.Struct(SessionLogFilter);

/**
 * A keep-alive on the live stream.
 *
 * Not a log row and not persisted — it exists because the transport lies. A
 * TCP connection to a laptop that has gone to sleep stays "open" indefinitely
 * from the server's side, and an idle connection through a proxy is usually cut
 * at somewhere between 30 and 60 seconds with nothing said to either end. A
 * client that has seen no bytes for two heartbeat intervals knows to reconnect;
 * without them it discovers the fight has moved on when the DM notices.
 *
 * It deliberately carries **no** `id`, so a browser's native `EventSource`
 * keeps the last real `seq` as its `Last-Event-ID` and a reconnect after a
 * quiet minute still resumes from the right place.
 */
export class Heartbeat extends Schema.Class<Heartbeat>("Heartbeat")({
  _tag: Schema.tag("Heartbeat"),
  /** The highest `seq` the server has sent on this connection. */
  seq: Schema.Int,
}) {}

/**
 * The live stream's wire format, as SSE.
 *
 * `HttpApiSchema.StreamSse` is given this in `events` mode rather than `data`
 * mode, and the difference matters: `data` mode fixes the event name to
 * `message` and the id to `undefined` (`HttpApiBuilder.encodeSseStream`), which
 * throws away both halves of the reconnect story. In `events` mode the handler
 * writes the `id` line itself, so every event carries its `seq`.
 *
 * Two members, discriminated by the SSE event name, because that is what a raw
 * `EventSource` dispatches on via `addEventListener`. The derived client sees
 * the union.
 */
export const LiveEvent = Schema.Union([
  Schema.Struct({
    id: Schema.String,
    event: Schema.Literal("session-event"),
    data: Schema.fromJsonString(SessionEvent),
  }),
  Schema.Struct({
    id: Schema.UndefinedOr(Schema.String),
    event: Schema.Literal("heartbeat"),
    data: Schema.fromJsonString(Heartbeat),
  }),
]);
export type LiveEvent = typeof LiveEvent.Type;
