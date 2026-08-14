import { useCallback, useSyncExternalStore } from "react";
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
