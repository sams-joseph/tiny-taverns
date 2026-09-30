import { useMemo } from "react";
import { NO_HOSTED_SESSION, useHostedSession, type HostedSession } from "./hostedSession";

/**
 * The credential for the *next* API call: the hosted session's token.
 *
 * The browser has one credential kind. Machine tokens still authenticate on the
 * server (`Accounts.ts`), and the server tests and scripts use them, but no
 * browser path pastes or stores one: Clerk is a prerequisite for running the
 * app (`AuthProvider.tsx`). No screen below this line knows which vendor minted
 * the token — `makeClient(token?)` takes a bearer like any other.
 *
 * **Nothing here is read at mount and held.** A hosted session token lives 60
 * seconds, so one read at mount works until the first refresh and then 401s
 * silently — for a page left open on a table, that is most of the session. The
 * atom client resolves a credential inside `HttpClient.mapRequestEffect`, so it
 * is asked immediately before each request; `campaign/CampaignScreen.test.tsx`
 * pins the property.
 */

/**
 * Whether this visitor has a credential — the question the signed-out gate is
 * built on.
 *
 * What it adds over `signedIn` is the third answer. A hosted provider decides
 * *"is anybody signed in?"* asynchronously, and a gate that read that as "no"
 * while it was still deciding would paint the marketing homepage over the app
 * for every signed-in visitor, every load. `unknown` is what that moment is
 * called.
 */
export type CredentialPresence = "present" | "absent" | "unknown";

/**
 * The rule, written once, for the root route's `beforeLoad` (which asks the
 * slot below) and for `RoutedApp` in `App.tsx` (which asks React, to know when
 * the router has to ask again).
 */
export const presenceOf = (
  session: Pick<HostedSession, "signedIn" | "loading">,
): CredentialPresence => {
  if (session.signedIn) return "present";
  return session.loading ? "unknown" : "absent";
};

/** Resolves a bearer token, or `undefined` when nobody is signed in. */
export type FetchCredential = () => Promise<string | undefined>;

/** The half of a hosted session that decides a credential, and the only half. */
type SessionCredential = Pick<HostedSession, "signedIn" | "fetchToken">;

/** What the slot below holds: the credential, and whether the vendor has answered yet. */
type PublishedSession = SessionCredential & Pick<HostedSession, "loading">;

/**
 * The rule, written once, for both readers below — the hook React screens use,
 * and the module-level `fetchCredential` the atom client layer uses.
 */
const credentialFrom =
  (session: SessionCredential): FetchCredential =>
  async () => {
    if (!session.signedIn) return undefined;
    const token = await session.fetchToken();
    return token === "" ? undefined : token;
  };

/**
 * The hosted session, published out of React so a layer built outside it can
 * still resolve a credential.
 *
 * `useCredential` below is a hook — it reads the vendor's state through React
 * context — and `api/atoms.ts` builds its HTTP client *layer* outside any
 * component, where no hook can be called. What is published here is the
 * **session**, not a token: a slot holding a token would be the held
 * credential the rule above forbids, and one holding a resolver would be a
 * second spelling of `credentialFrom`. `fetchCredential` calls
 * `session.fetchToken()` afresh on every request.
 *
 * **The slot has owners, and the innermost mounted one wins.** Scopes nest (a
 * test's own scope inside `renderAt`'s `TEST_SESSION`), and the slot has to
 * agree with the context, which the inner scope provides. A render publishes
 * top-down, so inner beats outer there for free; effects run innermost-first,
 * so a mount that simply re-published would hand the slot to the outer scope.
 * Each claim therefore carries its scope's depth, and a claim only takes the
 * slot from a mounted owner that is no deeper. A release gives the slot to the
 * deepest owner still mounted, which is what `StrictMode`'s simulated unmount
 * and remount needs: forget on the unmount, reclaim on the remount.
 *
 * With no owner the slot reads `NO_HOSTED_SESSION`, the same value
 * `HostedSessionContext` defaults to, so an unpublished slot and an unprovided
 * context agree: nobody is signed in.
 */
export interface HostedSessionClaim {
  /** The claiming scope, stable for its lifetime (`useId`). */
  readonly owner: string;
  /** How many scopes enclose it, itself included; the deeper claim wins. */
  readonly depth: number;
  readonly session: PublishedSession;
}

/** The scopes that have mounted and not yet unmounted, by owner. */
const mounted = new Map<string, HostedSessionClaim>();
let published: HostedSessionClaim | undefined;

const takes = (claim: HostedSessionClaim): boolean =>
  published === undefined ||
  published.owner === claim.owner ||
  !mounted.has(published.owner) ||
  published.depth <= claim.depth;

/**
 * Publishes a scope's session during render, unless a deeper mounted scope
 * holds the slot.
 *
 * Called by `HostedSessionScope`, which is the component that publishes the
 * same value *into* React — one act, two audiences, so the context and the slot
 * cannot disagree about who is signed in. A claim from a render that never
 * commits is not mounted, so the next claim of any depth replaces it.
 */
export const publishHostedSession = (claim: HostedSessionClaim): void => {
  if (mounted.has(claim.owner)) mounted.set(claim.owner, claim);
  if (takes(claim)) published = claim;
};

/** Records a scope as mounted and re-publishes its session, on every (re)mount. */
export const mountHostedSession = (claim: HostedSessionClaim): void => {
  mounted.set(claim.owner, claim);
  if (takes(claim)) published = claim;
};

/**
 * Forgets a scope on unmount. If it held the slot, the deepest scope still
 * mounted takes it, or nobody does, so a torn-down tree leaves nothing behind.
 */
export const forgetHostedSession = (owner: string): void => {
  mounted.delete(owner);
  if (published?.owner !== owner) return;
  published = undefined;
  for (const claim of mounted.values()) {
    if (published === undefined || claim.depth >= published.depth) published = claim;
  }
};

/**
 * The credential for the next request, resolved without React.
 *
 * `api/atoms.ts` is the caller, once per request. It is deliberately a
 * function and not a value: reading it returns a promise for a *fresh* token,
 * and there is nowhere in this shape to keep one.
 */
export const fetchCredential: FetchCredential = () =>
  credentialFrom(published?.session ?? NO_HOSTED_SESSION)();

/**
 * The slot, as the router sees it: `router.ts` hands this to every route as
 * context, and the root route's `beforeLoad` asks it who is signed in.
 *
 * It is the slot rather than React because a `beforeLoad` runs outside React,
 * and synchronous because the gate must never wait (`routes/__root.tsx` says
 * why). The router does not hear the slot change; `RoutedApp` tells it.
 */
export interface RouterAuth {
  readonly presence: () => CredentialPresence;
}

export const routerAuth: RouterAuth = {
  presence: () => presenceOf(published?.session ?? NO_HOSTED_SESSION),
};

export const useCredential = (): FetchCredential => {
  const { signedIn, fetchToken } = useHostedSession();

  return useMemo(() => credentialFrom({ signedIn, fetchToken }), [signedIn, fetchToken]);
};
