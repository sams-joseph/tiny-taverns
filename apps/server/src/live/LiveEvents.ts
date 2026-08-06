import type { SessionId } from "@taverns/api";
import { Context, Effect, Layer, PubSub, Stream } from "effect";

/**
 * A doorbell. Someone wrote to this session's log.
 *
 * It deliberately carries no payload beyond the session id — not the event, not
 * even its `seq`. §3.4 is explicit that the in-memory fan-out is "used for
 * fan-out only, never as state. It can be lost and rebuilt from the database",
 * and a notification that carried the event would be state: a subscriber would
 * render it, and the visibility rule that decides whether they may see it would
 * have to be applied in memory, to an object already in their process, by a
 * `filter` someone could forget. That is precisely the leak pattern
 * `repo/visibility.ts` exists to make impossible.
 *
 * So the stream re-reads the log through the SQL predicate every time this
 * rings. It costs one indexed query per mutation per connected client — for a
 * four-hour session's order-10³ writes, nothing — and buys three properties
 * that are otherwise all separate pieces of work:
 *
 *   - **Visibility stays in SQL.** There is no in-memory projection to get
 *     wrong, and a player's stream physically cannot carry a DM-only row.
 *   - **A dropped notification is self-healing.** The next one re-reads from the
 *     same cursor and catches up, so a full buffer costs latency rather than
 *     data.
 *   - **Reconnect is not a special path.** Catching up after a dropped
 *     connection and tailing live are the same query with the same cursor, so
 *     the path a laptop takes when it wakes up is the one exercised on every
 *     single event.
 */
export interface SessionTouched {
  readonly sessionId: SessionId;
}

/**
 * The in-process fan-out for live sessions.
 *
 * One `PubSub` for every session rather than one per session, filtered on
 * subscribe. A map of per-session pubsubs would need a lifecycle — created on
 * first subscriber, torn down on the last — and getting that wrong leaks a
 * pubsub per session ever run. Notifications are two words long and a session
 * filter is a pointer comparison.
 *
 * **`sliding`, not `unbounded`.** A subscriber that has stopped reading —
 * a browser tab the OS has frozen, a socket whose window is full — must not be
 * able to grow the server's memory without bound, and dropping its oldest
 * notification costs it nothing here: the doorbell carries no information, so a
 * subscriber that misses one and receives the next reads the same rows anyway.
 * This is the design's one real hosting constraint, and it is the one §4.4
 * names: in-process fan-out means one server process per live session. Swapping
 * this module for Postgres `LISTEN`/`NOTIFY` is what lifts it, with no schema
 * change and nothing else to touch.
 */
export class LiveEvents extends Context.Service<
  LiveEvents,
  {
    /** Ring the doorbell. Called after the writing transaction has committed. */
    readonly touched: (sessionId: SessionId) => Effect.Effect<void>;
    /**
     * Notifications for one session, for as long as the returned stream is
     * consumed.
     *
     * Subscribing is a scoped acquisition, and the stream is what holds the
     * scope — which matters for the ordering the live endpoint depends on:
     * subscribe *first*, then read the backlog, so nothing written between the
     * two is lost. See `handlers.ts`.
     */
    readonly subscribe: (sessionId: SessionId) => Stream.Stream<SessionTouched>;
  }
>()("LiveEvents") {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function* () {
      const pubsub = yield* PubSub.sliding<SessionTouched>(1024);

      return {
        touched: (sessionId) => Effect.asVoid(PubSub.publish(pubsub, { sessionId })),

        subscribe: (sessionId) =>
          Stream.unwrap(
            Effect.map(PubSub.subscribe(pubsub), (subscription) =>
              Stream.fromSubscription(subscription).pipe(
                Stream.filter((touched) => touched.sessionId === sessionId),
              ),
            ),
          ),
      };
    }),
  );
}
