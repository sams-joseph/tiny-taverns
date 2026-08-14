import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useHostedSession } from "./hostedSession";

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
 * ### Why this cannot fire on a plain page load
 *
 * The hazard is the whole design here, so it is worth being explicit about.
 * A configured provider says `signedIn: false` while it is still deciding — the
 * same `unknown` moment `HostedSession.loading` exists for. A clear keyed on
 * *"`signedIn` is false"* would therefore run on every single load, before the
 * vendor answered, and destroy the token of every developer who reloaded. It
 * would look like it worked when tested by hand.
 *
 * So the clear is keyed on a **transition this page has watched happen**, and
 * `seenSignedIn` is what makes that structural rather than a matter of care:
 *
 *  - it starts `false` on every mount, so a load can only ever *set* it;
 *  - only `signedIn === true` sets it, which no unsettled provider reports;
 *  - `loading` returns early, so an in-flight answer is not an answer;
 *  - with no provider configured `signedIn` is never `true`
 *    (`NO_HOSTED_SESSION`), so the whole hook is inert and the machine token
 *    keeps working exactly as it did — the opt-in property this app is built
 *    on, and the reason a developer never waits on a vendor they have not set
 *    up.
 *
 * A session that expires or is revoked in another tab takes the same path, and
 * that is correct rather than incidental: the credential this token was sitting
 * beside is gone, and the app's answer to "who are you" should not be "still
 * whoever pasted that".
 */
export const useSignOutForgetsMachineToken = (): void => {
  const { signedIn, loading } = useHostedSession();
  const seenSignedIn = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (signedIn) {
      seenSignedIn.current = true;
      return;
    }
    if (!seenSignedIn.current) return;
    seenSignedIn.current = false;
    clearMachineToken();
  }, [signedIn, loading]);
};

/** Resolves a bearer token, or `undefined` when the app has no credential at all. */
export type FetchCredential = () => Promise<string | undefined>;

export const useCredential = (): FetchCredential => {
  const { signedIn, fetchToken } = useHostedSession();

  return useCallback(async () => {
    // The hosted session wins when there is one: it is a real person, and its
    // account is the one just-in-time provisioning created for them.
    if (signedIn) {
      const session = await fetchToken();
      if (session !== undefined && session !== "") {
        return session;
      }
    }
    const machine = readMachineToken();
    return machine === "" ? undefined : machine;
  }, [signedIn, fetchToken]);
};
