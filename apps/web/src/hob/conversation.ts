import type { HobArtifact, HobTurn } from "./transcript";

/**
 * The one seam a real assistant attaches to.
 *
 * **Nothing answers today.** The retrieval and model work is unbuilt and
 * unstarted, and this file is deliberately the only place in `apps/web` that
 * knows it: `HobPanel` renders the turns it is handed, `HobDock` decides where
 * the panel sits, and neither has an opinion about where an answer comes from.
 * Replacing `useHobConversation` with something that talks to a server is the
 * whole of the client-side attachment.
 *
 * ### What is deliberately not here
 *
 * No endpoint, no client method, no request or response schema, no streaming
 * contract. A wire format guessed from a panel would be the wrong one, and
 * this repo already has the shape a real one will take — `packages/api` holds
 * the whole wire contract, the server implements it and `apps/web` derives its
 * client from it, so an assistant endpoint is a `HttpApiEndpoint` in that
 * package and not an invention here.
 *
 * The interesting half of that work is not the transport. It is that
 * `assistant_turn_id` and `origin` already sit on every content table (see
 * `apps/server`'s schema notes) waiting for a generated row to point at, and
 * that `CurrentActor` is a type-level requirement — so whatever answers has to
 * do it inside the same visibility rules as everything else, and *Save to
 * session* is an ordinary authored write with provenance attached, not a new
 * privilege.
 *
 * ### What attaching looks like
 *
 * Return a `HobConversation` whose `send` is defined. The panel switches from
 * the "nothing is listening" line to the real composer on exactly that: an
 * absent `send` is the honest state, not a loading state, and it is why there
 * is no fabricated reply anywhere in this module. `thinking` is the drawn
 * state for an answer on its way; `saved` is which artifacts already reached
 * the session, kept by id so a re-read cannot lose it.
 */
export interface HobConversation {
  /** Newest last. Empty renders the starter grid. */
  readonly turns: ReadonlyArray<HobTurn>;
  readonly thinking: boolean;
  readonly savedArtifactIds: ReadonlyArray<string>;
  /** Undefined while nothing is behind the panel. Define it and the composer appears. */
  readonly send: ((text: string) => void) | undefined;
  readonly save: ((artifact: HobArtifact) => void) | undefined;
  readonly discard: ((artifact: HobArtifact) => void) | undefined;
  readonly retry: ((artifact: HobArtifact) => void) | undefined;
  readonly reset: (() => void) | undefined;
}

const UNATTACHED: HobConversation = {
  turns: [],
  thinking: false,
  savedArtifactIds: [],
  send: undefined,
  save: undefined,
  discard: undefined,
  retry: undefined,
  reset: undefined,
};

/**
 * The only implementation there is: one that answers nothing, and says so.
 *
 * A local stub that echoed a canned reply would demo better and would be worse
 * than useless — it would hide from whoever opens the panel that the assistant
 * does not exist yet, which is the single most important thing this surface has
 * to communicate right now.
 */
export function useHobConversation(): HobConversation {
  return UNATTACHED;
}
