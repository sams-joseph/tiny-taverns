import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { TavernsApi } from "@taverns/api";
import { Cause, Effect, Option } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http";
import { AsyncResult, Atom, AtomHttpApi } from "effect/unstable/reactivity";
import { fetchCredential } from "../auth/credential";
import type { TavernsClient } from "./client";
import { failureFromCause, type Resource } from "./failure";

/**
 * How a screen loads from the API: one atom, one loading state, one failure.
 *
 * **This is the idiom to copy.** `api/resource.ts`'s `useApiResource` is the
 * one being retired; a new screen written on it will have to be ported again.
 * See `AGENTS.md` for which call sites have moved and which have not.
 *
 * What an atom gives that the hook does not, in this codebase specifically:
 *
 *  - **It keeps the value it has while it re-reads.** `AsyncResult` is
 *    stale-while-revalidate by construction — a refresh keeps the `Success` and
 *    raises `waiting`, where `useApiResource` sets `{state: "loading"}` at the
 *    top of every run and throws the last good answer away. That is the blank
 *    screen a DM sees for half a second on a real connection every time a write
 *    reloads a screen, and it is gone for a ported call site.
 *  - **One read is shared by everything that asks for it.** An atom is
 *    identified by object identity and memoised in the registry, so two
 *    components naming the same atom make one request.
 *  - **Failures stay typed.** `Api.query`'s error is the endpoint's *declared*
 *    union rather than `unknown`, and `failureFromCause` is the whole adapter.
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
 * Takes the same callback `useApiResource` takes — `(client) => Effect` — so a
 * ported call site keeps its loader unchanged and only changes how the result
 * reaches the component. Compose *within* the Effect rather than building
 * several atoms per screen, for the reason `useApiResource` gave: one
 * `Effect.all` over four endpoints is one loading state and one error, where
 * four are sixteen combinations to render.
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
 *   apiAtom((client) => client.invites.list({ params: { campaignId } })),
 * );
 * ```
 *
 * Key it on a **string** (an id, or ids joined). `Atom.family`'s map compares
 * keys with Effect's `Equal`, which is value equality for a string and
 * reference equality for a plain object — so an object key silently misses on
 * every render and builds a new atom each time.
 */
export const apiAtom = <A, E>(
  use: (client: TavernsClient) => Effect.Effect<A, E>,
): Atom.Atom<AsyncResult.AsyncResult<A, E>> => Api.runtime.atom(Effect.flatMap(Api, use));

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
 */
export const useApiAtom = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
): readonly [Resource<A>, () => void] => {
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  return [toResource(result), refresh] as const;
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
