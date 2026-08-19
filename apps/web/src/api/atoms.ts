import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { TavernsApi } from "@taverns/api";
import { Cause, Effect, Option } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { AsyncResult, Atom, AtomHttpApi, Reactivity } from "effect/unstable/reactivity";
import { useMemo } from "react";
import { fetchCredential } from "../auth/credential";
import type { TavernsClient } from "./client";
import { failureFromCause, type Resource } from "./failure";
import type { Invalidation } from "./keys";

/**
 * How a screen loads from the API: one atom, one loading state, one failure.
 *
 * **This is the one way a screen reads.** It replaced a hand-rolled
 * `useApiResource` (`useEffect` + `useState` + `Effect.result`), which is gone
 * rather than deprecated — every one of its eighteen call sites moved, so there
 * is no second idiom to copy by accident. Writing is `api/mutation.ts`, over
 * the same client and the same invalidation vocabulary; `api/keys.ts` is the
 * map that joins the two.
 *
 * What an atom gives that the hook did not, in this codebase specifically:
 *
 *  - **It keeps the value it has while it re-reads.** `AsyncResult` is
 *    stale-while-revalidate by construction — a refresh keeps the `Success` and
 *    raises `waiting`, where `useApiResource` set `{state: "loading"}` at the
 *    top of every run and threw the last good answer away. That is the blank
 *    screen a DM saw for about half a second on a real connection every time a
 *    write reloaded a screen.
 *  - **One read is shared by everything that asks for it.** An atom is
 *    identified by object identity and memoised in the registry, so two
 *    components naming the same atom make one request. That is what let
 *    `CampaignChrome` stop re-reading the campaign on every move between its
 *    five destinations — a cost its own doc block used to state as the price of
 *    one source of truth.
 *  - **A read says what it answers, and a write says what it changed.** Both
 *    say it in the vocabulary of `api/keys.ts`, and a write refreshes exactly
 *    the reads that named the same resource. That is the whole of what made
 *    adding one checklist line cost one read instead of eight.
 *  - **Failures stay typed.** An endpoint's error is its *declared* union
 *    rather than `unknown`, and `failureFromCause` is the whole adapter.
 *
 * ### The client is derived from `TavernsApi`, exactly as `client.ts` is
 *
 * `AtomHttpApi.Service` builds it from the same declaration the server
 * implements, so adopting atoms did not introduce a second description of the
 * wire format — which is the property `client.ts` exists to hold.
 *
 * ### Why the service class is not exported, and must not be
 *
 * `TavernsApi` is 23 groups and 90 endpoints, and `AtomHttpApiClient` layers
 * `query` and `mutation` overloads on top of that whole client type. Exported,
 * the inferred type has to be serialised across a module boundary and `tsc`
 * gives up:
 *
 * ```
 * error TS7056: The inferred type of this node exceeds the maximum length the
 * compiler will serialize. An explicit type annotation is needed.
 * ```
 *
 * — and the annotation it asks for is not writable by hand. TS7056 fires only
 * at a module boundary, so keeping `Api` local and exporting the *narrow*
 * things built from it typechecks cleanly. `apps/web`'s existing
 * `TavernsClient` exports fine; this is specifically the atom wrapper's extra
 * type surface. **One module owns the client and exports named atoms; there is
 * never a shared exported client object.**
 */

/** Where the API lives. Vite inlines this at build time; defaults to dev. */
const baseUrl: string = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";

/**
 * The credential, attached per request rather than per client.
 *
 * **This is the one place the port had a genuine design problem, and the shape
 * of the fix is the whole of it.** `useCredential` is a React hook, and an
 * atom's client layer is built *outside* React — the layer is constructed once,
 * by the registry, with no component around it. So the client cannot call the
 * hook, and the rule it exists to enforce still has to hold:
 *
 * > *The token is fetched immediately before each call, never held in state.*
 *
 * Clerk's session tokens live 60 seconds, so a token read once when this layer
 * was built would work for under a minute and then 401 silently for a page left
 * open at a table. `mapRequestEffect` is what keeps the property: it runs
 * **per request**, so `fetchCredential()` is called on the way out of every
 * single call rather than once. Nothing here holds the result.
 *
 * `auth/credential.ts` is where the token comes from and is the one place that
 * decides which of the two kinds wins; see `publishHostedSession` there for how
 * the hosted half reaches a module that has no React above it.
 */
const withCredential = HttpClient.mapRequestEffect((request) =>
  Effect.map(Effect.promise(fetchCredential), (token) =>
    token === undefined || token === "" ? request : HttpClientRequest.bearerToken(request, token),
  ),
);

class Api extends AtomHttpApi.Service<Api>()("TavernsAtomApi", {
  api: TavernsApi,
  httpClient: FetchHttpClient.layer,
  baseUrl,
  transformClient: withCredential,
}) {}

/**
 * One screen's read, as an atom.
 *
 * Takes a loader — `(client) => Effect` — and **the reads it answers**, in the
 * vocabulary of `api/keys.ts`. Compose *within* the Effect where the parts of a
 * read are only ever wanted together: one `Effect.all` over four endpoints is
 * one loading state and one error, where four atoms are sixteen combinations to
 * render.
 *
 * ### `answers` is required, and empty is a real answer
 *
 * A write refreshes the atoms that named the resource it changed, so this list
 * is the other half of every `submit`. It is a required argument because the
 * alternative is a default, and a default here means a read that silently never
 * refreshes — which is exactly the failure this design has to be careful about.
 * `[]` says *nothing writes this*: the invitation preview a stranger reads
 * before they have an account, a picker that lives as long as a dialog.
 *
 * **Split a read only where a write wants to refresh half of it.** The campaign
 * view is split into eight because adding a checklist line should re-read the
 * checklist and nothing else; the character sheet is one atom because every
 * write on that screen changes all of it. `AsyncResult.all` is how a screen
 * built from several atoms still renders three states — see
 * `campaign/load.ts`, which is the worked example.
 *
 * ### Build it inside an `Atom.family`, keyed on what it closes over
 *
 * **An atom is identified by object identity**, so this is the atom-shaped
 * version of the rule that `use` must be `useCallback`-stable — and it is a
 * sharper rule, because a fresh atom on every render is an infinite loop rather
 * than a wasted request. `Atom.family` memoises per key, which also makes two
 * components reading the same id share one request:
 *
 * ```ts
 * const invitesAtom = Atom.family((campaignId: CampaignId) =>
 *   apiAtom((client) => client.invites.list({ params: { campaignId } }), [
 *     reads.invites(campaignId),
 *   ]),
 * );
 * ```
 *
 * **A record key works, and is the right shape for a read with more than one
 * input** — a campaign and a search term, say. `Atom.family` memoises through
 * `MutableHashMap`, which compares with Effect's `Equal` and hashes with
 * `Hash`, and v4 makes both *structural* for a plain object: two records with
 * the same fields are one key and therefore one atom. Measured rather than
 * assumed, and pinned in `atoms.test.tsx` — because if it were reference
 * equality instead, every render would build a fresh atom and the failure would
 * be an infinite loop rather than a wasted request.
 *
 * Keep the key to primitives, though. It is hashed on every render, and a value
 * that is not structurally comparable (a function, a class instance) puts the
 * loop back.
 */
export const apiAtom = <A, E>(
  use: (client: TavernsClient) => Effect.Effect<A, E>,
  answers: Invalidation,
): Atom.Atom<AsyncResult.AsyncResult<A, E>> => {
  const atom = Api.runtime.atom(Effect.flatMap(Api, use));
  // Registering on nothing is a real answer — a preview read before anybody has
  // an account, a one-shot picker — and `withReactivity` on an empty list would
  // wrap the atom in a subscription that can never fire.
  return answers.length === 0 ? atom : Atom.withReactivity(answers)(atom);
};

/**
 * The same read, as an atom a screen may also **write into**.
 *
 * There is one of these and there should stay one: `run/load.ts`'s
 * `liveStateAtom`, the two rows a live fight changes. The runner is the only
 * screen whose writes carry an answer that is *newer than any read* — the run
 * `nextTurn` returns, the combatant `damage` returns — and whose whole design
 * rests on using it rather than waiting for the doorbell. Before this existed
 * that answer had to go somewhere else, so the fight lived twice: once in the
 * atom the screen read and once in a `useState` copy the controller merged
 * into. Two copies of one fight is exactly the divergence a registry exists to
 * prevent.
 *
 * **The write is the whole `AsyncResult`, not the value inside it**, and that is
 * forced rather than chosen: `useAtomSet` treats a function argument as a
 * functional update over `R`, so a write type that is itself a function is not
 * expressible. It reads better anyway — a caller writes
 * `set((current) => AsyncResult.map(current, edit))`, and `AsyncResult.map`
 * carries the edit into a failure's *previous* success too, which is precisely
 * the state a fight is in while a re-read is failing and the last good rows are
 * still on screen.
 *
 * Everything else is `apiAtom`: same client, same credential per request, same
 * required `answers`.
 *
 * **A write is not a refresh.** Setting the value does not touch the read that
 * produced it, so the next refresh answers with whatever the server holds and
 * the local edit is gone — which is what a merge of one row means and why the
 * runner still re-reads on the doorbell.
 */
export const writableApiAtom = <A, E>(
  use: (client: TavernsClient) => Effect.Effect<A, E>,
  answers: Invalidation,
): Atom.Writable<AsyncResult.AsyncResult<A, E>, AsyncResult.AsyncResult<A, E>> => {
  const base = Api.runtime.atom(Effect.flatMap(Api, use));
  const atom = Atom.writable<AsyncResult.AsyncResult<A, E>, AsyncResult.AsyncResult<A, E>>(
    base.read,
    (ctx, value) => ctx.setSelf(value),
  );
  // `Atom.transform` keeps a writable atom writable and forwards writes to it,
  // so wrapping for reactivity costs the write nothing.
  return answers.length === 0 ? atom : Atom.withReactivity(answers)(atom);
};

/**
 * Tells every read that named one of these resources to read it again.
 *
 * **This is the seam between the two verbs, and it is one line of library.**
 * `Atom.withReactivity` (above, in `apiAtom`) registers an atom's refresh
 * against a set of keys on the `Reactivity` service; this fires them. Both
 * resolve the *same* service instance — `Atom.runtime` memoises `Reactivity.layer`
 * in `Atom.defaultMemoMap`, and `AtomHttpApi.Service` builds `Api.runtime` from
 * that same default factory — so a read and a write naming one key cannot end
 * up talking to two different registries.
 *
 * It is an atom rather than a plain function for the same reason the client is:
 * the service lives in the runtime's context, which is reachable from an effect
 * the runtime runs and from nowhere else. Its own `AsyncResult` is never read —
 * this atom exists for what it does, not for what it answers — and it is
 * `concurrent` so that two writes landing together both fire rather than one
 * interrupting the other.
 */
const invalidateAtom = Api.runtime.fn<Invalidation>()((keys) => Reactivity.invalidate(keys), {
  concurrent: true,
});

/**
 * The write side of the seam, as a hook.
 *
 * `api/mutation.ts` calls this and nothing else does; a screen invalidates by
 * naming keys on its `submit`, never by reaching for this directly. It is
 * exported rather than inlined there because `Api` may not cross a module
 * boundary — see the TS7056 note above — so anything that needs the runtime
 * lives in this file and leaves through a narrow door.
 */
export const useInvalidate = (): ((keys: Invalidation) => void) => useAtomSet(invalidateAtom);

/**
 * Reads an atom as the three states a screen renders, plus a refresh.
 *
 * The returned pair is deliberately the shape `useApiResource` returns, so a
 * ported call site is a changed import and a changed first line rather than a
 * rewritten component — and so `ui/states.tsx` keeps saying the same things
 * about the same failures. What is new is `refreshing` on the `ready` arm: a
 * re-read holds the value it has, so a screen stops blanking on every write.
 *
 * Three mappings that are decisions rather than plumbing:
 *
 *  - **A `Failure` renders as failed even when it has a `previousSuccess`.**
 *    That is what the hook it replaces does, and quietly showing stale rows
 *    under a load that just 401'd would be a worse answer than saying so.
 *    `AsyncResult` keeps the previous value either way, so a screen that wants
 *    to render both later can.
 *  - **An interrupted read is not a failure.** A refresh that lands while one
 *    is in flight interrupts it, and `Cause.squash` of an interrupt-only cause
 *    is the string *"All fibers interrupted without error"* — which would reach
 *    a DM as *"That did not work"* under the heading of a screen that is fine.
 *    It reads as still-loading, which is what it is.
 *  - **`Initial` is `loading`**, whether or not it is waiting: nothing has been
 *    read yet, so there is no value to keep.
 *
 * **The `Resource` is memoised on the `AsyncResult`, and that is load-bearing
 * rather than an optimisation.** `useApiResource` returned React state, so its
 * `Resource` kept its identity between renders and a screen could write
 * `useEffect(…, [resource])`. `toResource` allocates, so an unmemoised version
 * changes identity every render and any such effect re-runs every render —
 * which, for an effect that sets state to a fresh value (`setExtra([])` in
 * `bestiary/corpus.ts` does exactly that), is an infinite loop rather than
 * wasted work. The `AsyncResult` itself is stable per registry value, so
 * keying on it restores the property the hook it replaces had.
 */
export const useApiAtom = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
): readonly [Resource<A>, () => void] => {
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const resource = useMemo(() => toResource(result), [result]);
  return [resource, refresh] as const;
};

/**
 * The same mapping, for a screen that has an `AsyncResult` in hand rather than
 * an atom to read.
 *
 * There is exactly one such screen and it is `campaign/CampaignChrome.tsx`: the
 * frame reads the campaign view *and* whichever destination-specific atom the
 * screen handed it, and combines the two with `AsyncResult.all` — which is the
 * atom-shaped counterpart of the `Effect.all` it used to compose. Combining
 * first and mapping once is what keeps the frame's own rule intact: one screen,
 * three states, not sixty-four.
 */
export const asResource = <A, E>(result: AsyncResult.AsyncResult<A, E>): Resource<A> =>
  toResource(result);

/**
 * Several atoms read as one value, without losing the one already on screen.
 *
 * **`AsyncResult.all` alone is not enough here, and the case it gets wrong is
 * exactly the one this port exists for.** `all` returns the first part that is
 * not a success, verbatim — so a part that has never been read at all makes the
 * whole `Initial`, which a screen renders as *Loading…* over a blank body. That
 * is right on the first load and wrong every time afterwards: when a DM opens a
 * night, the checklist and the fight list become atoms **keyed on a session id
 * that did not exist a moment ago**, and a screen full of unchanged encounters
 * and notes would blank while two new reads landed.
 *
 * So a whole that is still assembling renders as the last whole, waiting — the
 * same stale-while-revalidate `AsyncResult` gives one atom, extended to a set
 * of them. A **failure** is passed through rather than swallowed: a part that
 * 401'd is something a screen has to say, and quietly showing rows underneath
 * it would be the worse answer (see `toResource`, which makes the same call).
 *
 * Only usable inside an atom's own read function, because "the last whole" is
 * `get.self()` — which is also what makes it free of a ref somebody has to keep
 * in step.
 */
export const combine = <A, E>(
  get: Atom.AtomContext,
  next: AsyncResult.AsyncResult<A, E>,
): AsyncResult.AsyncResult<A, E> => {
  if (!AsyncResult.isInitial(next)) return next;
  const previous = get.self<AsyncResult.AsyncResult<A, E>>();
  return Option.isSome(previous) && AsyncResult.isSuccess(previous.value)
    ? AsyncResult.success(previous.value.value, { waiting: true })
    : next;
};

const toResource = <A, E>(result: AsyncResult.AsyncResult<A, E>): Resource<A> => {
  if (AsyncResult.isSuccess(result)) {
    return { state: "ready", value: result.value, refreshing: result.waiting };
  }
  if (AsyncResult.isFailure(result)) {
    // `AsyncResult.isInterrupted` says the same thing, and narrows `result` to
    // `Failure` — which it already is — leaving the else branch `never`.
    if (Cause.hasInterruptsOnly(result.cause)) {
      const previous = Option.getOrUndefined(result.previousSuccess);
      return previous === undefined
        ? { state: "loading" }
        : { state: "ready", value: previous.value, refreshing: true };
    }
    return { state: "failed", failure: failureFromCause(result.cause) };
  }
  return { state: "loading" };
};
