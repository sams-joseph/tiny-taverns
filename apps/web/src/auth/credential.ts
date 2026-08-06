import { useCallback } from "react";
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

export const writeMachineToken = (token: string): void => {
  storage()?.setItem(MACHINE_TOKEN_KEY, token);
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
