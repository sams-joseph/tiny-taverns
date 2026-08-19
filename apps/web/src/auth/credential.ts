import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { NO_HOSTED_SESSION, useHostedSession, type HostedSession } from "./hostedSession";

/**
 * The credential for the *next* API call, whichever kind the developer has.
 *
 * Two credential kinds converge here, exactly as they converge on one `Actor`
 * in the server's `Authorization.ts`: a hosted session token when someone is
 * signed in, and otherwise the machine token pasted into the Server panel. No
 * screen below this line knows which it got — `makeClient(token?)` takes a
 * bearer and a session token is a bearer like any other.
 *
 * **Nothing here is read at mount and held.** A hosted session token lives 60
 * seconds, so one read at mount works until the first refresh and then 401s
 * silently — for a page left open on a table, that is most of the session. The
 * machine token is read from storage per call for the same shape of reason:
 * pasting one into the Server panel takes effect on the next call rather than
 * on the next reload. `useApiResource` calls this immediately before each
 * request, and `ServerPanel.test.tsx` pins the property for the hosted half.
 */

const MACHINE_TOKEN_KEY = "taverns.token";

/**
 * Where "this browser has been signed in" is remembered, so that a sign-out
 * still forgets the machine token when the vendor reloads the page on its way
 * out. See `useSignOutForgetsMachineToken`, which is the only reader.
 *
 * Storage rather than a `useRef`, and that is the whole fix: a marker held in
 * memory dies with the tree, and a hosted sign-out commonly navigates.
 */
const HOSTED_SEEN_KEY = "taverns.hosted-seen";

/**
 * `window.localStorage`, not the bare global: Node 26 defines its own
 * `localStorage` that is `undefined` unless the process was started with
 * `--localstorage-file`, and under jsdom that global shadows the one the
 * document actually has.
 */
const storage = (): Storage | undefined => globalThis.window?.localStorage;

/** The pasted machine token, or `""` when there is none. */
export const readMachineToken = (): string => storage()?.getItem(MACHINE_TOKEN_KEY) ?? "";

/**
 * Everything watching the machine token, so pasting one is a *render* and not
 * only a fact about the next request.
 *
 * It became load-bearing when the signed-out gate landed: whether there is a
 * credential now decides which page the app is, and `localStorage` fires no
 * event for a write in its own tab. Without this, pasting a token into the
 * Server panel would leave the marketing homepage on screen until something
 * else happened to re-render — which reads exactly like the paste not working.
 */
const watchers = new Set<() => void>();

const subscribeToMachineToken = (notify: () => void): (() => void) => {
  watchers.add(notify);
  // The other tab's paste. `storage` fires only for *other* documents, which
  // is precisely the half `watchers` cannot see.
  globalThis.window?.addEventListener("storage", notify);
  return () => {
    watchers.delete(notify);
    globalThis.window?.removeEventListener("storage", notify);
  };
};

export const writeMachineToken = (token: string): void => {
  storage()?.setItem(MACHINE_TOKEN_KEY, token);
  for (const notify of watchers) notify();
};

/**
 * Forgets the pasted machine token.
 *
 * `removeItem` rather than writing `""`: an empty string already reads as
 * absent everywhere, so storing one would be a second spelling of "no token"
 * sitting in storage for somebody to find and wonder about.
 *
 * It notifies the same watchers a write does, which is what makes the clear a
 * *render* — the signed-out gate is subscribed, so forgetting the token puts
 * the marketing page on screen rather than waiting for the next reload.
 */
export const clearMachineToken = (): void => {
  storage()?.removeItem(MACHINE_TOKEN_KEY);
  for (const notify of watchers) notify();
};

/**
 * The pasted machine token as React state.
 *
 * `useSyncExternalStore` rather than `useState` seeded from storage: the token
 * lives outside React, is written from one component and read by another, and
 * a snapshot held in state would be the second answer that goes stale. The
 * snapshot is a string, so React's own `Object.is` comparison settles it.
 */
export const useMachineToken = (): string =>
  useSyncExternalStore(subscribeToMachineToken, readMachineToken, () => "");

/**
 * Whether this visitor has *any* credential — the question the signed-out gate
 * is built on, and the captain's own wording for it: *"it shows when there is
 * neither a hosted session nor a developer token"*.
 *
 * It is the synchronous shadow of `useCredential` below and must stay in step
 * with it: same two kinds, same order of preference. What it adds is the third
 * answer `useCredential` has no need for. A hosted provider decides *"is
 * anybody signed in?"* asynchronously, and a gate that read that as "no" while
 * it was still deciding would paint the marketing homepage over the app for
 * every signed-in visitor, every load. `unknown` is what that moment is called.
 */
export type CredentialPresence = "present" | "absent" | "unknown";

export const useCredentialPresence = (): CredentialPresence => {
  const { signedIn, loading } = useHostedSession();
  const machine = useMachineToken();

  // A pasted token settles it either way, so it is worth asking first: a
  // developer with one never waits on a vendor they have not configured, and
  // one who *has* configured it still gets the app rather than a blank frame.
  if (machine !== "") return "present";
  if (signedIn) return "present";
  return loading ? "unknown" : "absent";
};

/**
 * Whether this browser has been signed in — the armed half of the sign-out
 * clear, and the *only* thing that distinguishes a sign-out from an ordinary
 * signed-out page load.
 *
 * The value is never read; the key's presence is the whole of it.
 */
const signedInHere = (): boolean => (storage()?.getItem(HOSTED_SEEN_KEY) ?? null) !== null;

const armSignOutClear = (): void => void storage()?.setItem(HOSTED_SEEN_KEY, "1");

const disarmSignOutClear = (): void => void storage()?.removeItem(HOSTED_SEEN_KEY);

/**
 * Signing out of the hosted provider forgets the pasted machine token too.
 *
 * **The captain's decision, with the cost put to them and accepted: after any
 * sign-out a developer pastes their token again.** It is what makes signing out
 * mean *signed out*. Without it the two credential kinds come apart at exactly
 * the wrong moment: the hosted session ends, the machine token in storage does
 * not, `useCredentialPresence` above answers `present` on the strength of it,
 * and the app stays on screen for ever where the marketing page was asked for.
 * That is the reported defect, and it was invisible in a private window because
 * a private window has no stored token to outrank anything.
 *
 * ### The clear must survive the app being built again
 *
 * **This is the second round of that defect and the reason the marker is in
 * storage.** The first fix armed a `useRef` that started `false` on every
 * mount, set only by observing `signedIn === true`. That is remount-*fragile*,
 * and a hosted sign-out is exactly a remount: the vendor navigates to its
 * after-sign-out URL, the page reloads, and the fresh instance never watches
 * anybody sign in — so the transition it is waiting for cannot happen and the
 * token is never cleared. Measured as a bare `http://localhost:5173/` showing
 * the app and *"No credential yet"*, with `taverns.token` still in storage and
 * reloading no help at all.
 *
 * So the arming is durable and the hook reads it back rather than remembering
 * it: `signedInHere()` outlives the tree, the tab and the reload, which is the
 * one property a ref could not have.
 *
 * ### Why it still cannot fire on a plain page load
 *
 * The hazard is real and is the worse of the two, so nothing here relaxes it.
 * A configured provider says `signedIn: false` while it is still deciding — the
 * same `unknown` moment `HostedSession.loading` exists for. A clear keyed on
 * *"`signedIn` is false"* would run on every single load, before the vendor
 * answered, and destroy the token of every developer who reloaded. It would
 * look like it worked when tested by hand.
 *
 * Three guards keep that shut, and each answers a different half of it:
 *
 *  - **`loading` returns early**, so an in-flight answer is not an answer. This
 *    is the one that makes an ordinary reload safe: the marker may well be
 *    armed, and while the vendor is deciding it is not consulted at all.
 *  - **only a settled `signedIn === true` arms it**, which no unsettled
 *    provider reports. A browser that has never been signed in never has a
 *    marker, so the everyday case — Clerk configured, nobody signed in, working
 *    off a pasted token — is untouched however often it reloads.
 *  - **`configured` returns earlier still**, so a build with no publishable key
 *    neither writes the marker nor spends one. That is most development, and it
 *    is inert rather than merely harmless: the hook reaches no storage at all.
 *
 * ### The marker is spent, not left behind
 *
 * The mirror of the bug above, and the cost of holding state: a marker that
 * outlived the sign-out it armed would eat the *next* token pasted, on the next
 * reload, for ever. So disarming is part of the same act as the clear rather
 * than a tidy-up somewhere else — after a sign-out the browser is back to
 * having-never-been-signed-in, and a token pasted afterwards is safe until
 * somebody signs in again.
 *
 * A session that expires or is revoked in another tab takes the same path, and
 * that is correct rather than incidental: the credential this token was sitting
 * beside is gone, and the app's answer to "who are you" should not be "still
 * whoever pasted that". It is also why this observes the vendor's state rather
 * than hooking its sign-out button — see `AGENTS.md` for the seam that was
 * weighed and rejected.
 *
 * `useLayoutEffect`, not `useEffect`: the clear flips the signed-out gate, and
 * on the load after a sign-out the app would otherwise paint for one frame
 * before the marketing page replaced it. That is the flash `SignedOutGate`
 * exists to avoid, arriving by a different door. This app has no SSR, so there
 * is no environment where a layout effect is the wrong hook.
 */
export const useSignOutForgetsMachineToken = (): void => {
  const { configured, signedIn, loading } = useHostedSession();

  useLayoutEffect(() => {
    if (!configured) return;
    if (loading) return;
    if (signedIn) {
      armSignOutClear();
      return;
    }
    if (!signedInHere()) return;
    // Disarmed first, so that nothing woken by the clear can find the marker
    // still standing and spend it a second time.
    disarmSignOutClear();
    clearMachineToken();
  }, [configured, signedIn, loading]);
};

/** Resolves a bearer token, or `undefined` when the app has no credential at all. */
export type FetchCredential = () => Promise<string | undefined>;

/** The half of a hosted session that decides a credential, and the only half. */
type SessionCredential = Pick<HostedSession, "signedIn" | "fetchToken">;

/**
 * Which credential wins, written once.
 *
 * Both readers below go through this — the hook React screens use, and the
 * module-level `fetchCredential` the atom client layer uses — so "hosted
 * session first, then the pasted machine token" is one sentence rather than two
 * that can drift. It is the rule this whole file is about; see the header.
 */
const credentialFrom =
  (session: SessionCredential): FetchCredential =>
  async () => {
    // The hosted session wins when there is one: it is a real person, and its
    // account is the one just-in-time provisioning created for them.
    if (session.signedIn) {
      const token = await session.fetchToken();
      if (token !== undefined && token !== "") {
        return token;
      }
    }
    const machine = readMachineToken();
    return machine === "" ? undefined : machine;
  };

/**
 * The hosted session, published out of React so a layer built outside it can
 * still resolve a credential.
 *
 * **This is the one design problem the atom port had, and this slot is the
 * decision taken.** `useCredential` below is a hook — it reads the vendor's
 * state through React context — and `api/atoms.ts` builds its HTTP client
 * *layer* outside any component, where no hook can be called. The invariant
 * that had to survive is the one `ServerPanel.test.tsx` pins:
 *
 * > *The token is fetched immediately before each call, never held in state.*
 *
 * So what is published here is the **session**, not a token: a slot holding a
 * token would be the held credential the rule forbids, and one holding a
 * resolver would be a second spelling of `credentialFrom`. `fetchCredential`
 * calls `session.fetchToken()` afresh on every request, which is what the
 * vendor's 60-second tokens require and what `mapRequestEffect` in
 * `api/atoms.ts` arranges.
 *
 * **The default is `NO_HOSTED_SESSION` — the same value `HostedSessionContext`
 * defaults to — and that is what makes an unpublished slot correct rather than
 * merely harmless.** With no provider mounted, both readers resolve the pasted
 * machine token and agree; a build with no publishable key (which is most
 * development, and every test) never needs the publish to have happened.
 */
let publishedSession: SessionCredential = NO_HOSTED_SESSION;

/**
 * Publishes the current hosted session for readers outside React.
 *
 * Called by `HostedSessionScope`, which is the component that publishes the
 * same value *into* React — one act, two audiences, so the context and the slot
 * cannot disagree about who is signed in.
 */
export const publishHostedSession = (session: SessionCredential): void => {
  publishedSession = session;
};

/** Puts the slot back to "no provider", so a torn-down tree leaves nothing behind. */
export const forgetHostedSession = (): void => {
  publishedSession = NO_HOSTED_SESSION;
};

/**
 * The credential for the next request, resolved without React.
 *
 * `api/atoms.ts` is the caller, once per request. It is deliberately a
 * function and not a value: reading it returns a promise for a *fresh* token,
 * and there is nowhere in this shape to keep one.
 */
export const fetchCredential: FetchCredential = () => credentialFrom(publishedSession)();

export const useCredential = (): FetchCredential => {
  const { signedIn, fetchToken } = useHostedSession();

  return useMemo(() => credentialFrom({ signedIn, fetchToken }), [signedIn, fetchToken]);
};
