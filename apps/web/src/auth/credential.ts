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

export const useCredentialPresence = (): CredentialPresence => {
  const { signedIn, loading } = useHostedSession();

  if (signedIn) return "present";
  return loading ? "unknown" : "absent";
};

/** Resolves a bearer token, or `undefined` when nobody is signed in. */
export type FetchCredential = () => Promise<string | undefined>;

/** The half of a hosted session that decides a credential, and the only half. */
type SessionCredential = Pick<HostedSession, "signedIn" | "fetchToken">;

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
 * The default is `NO_HOSTED_SESSION`, the same value `HostedSessionContext`
 * defaults to, so an unpublished slot and an unprovided context agree: nobody
 * is signed in.
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
