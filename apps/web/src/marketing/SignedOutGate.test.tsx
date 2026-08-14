import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { renderAt } from "../test/renderRoute";
import { installMemoryStorage } from "../test/storage";

/**
 * The gate, in every state it has — which is the part of this work a future
 * session will most need to be able to check.
 *
 * **The captain's wording is the specification**: *"it shows when there is
 * neither a hosted session nor a developer token"*. So the three states below
 * are not three ways of saying "signed in": a machine token and a hosted
 * session are different credentials resolved by different code, and the whole
 * reason the gate is written against `auth/credential.ts` rather than against
 * the hosted session is that in development there is usually no hosted session
 * to have.
 *
 * The fourth case is the one with no visible symptom until it is wrong: a
 * configured provider that has not answered yet. Read as "not signed in" it
 * paints the homepage over the app on every load, so it is asserted here as
 * *neither page*.
 */

const CAMPAIGN_LIST = "/campaigns";
const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaa";

/**
 * A wire that answers everything with an empty list, so a gated screen that
 * *does* render says so by its chrome rather than by a network failure.
 */
vi.stubGlobal("fetch", () =>
  Promise.resolve(
    new Response("[]", { status: 200, headers: { "content-type": "application/json" } }),
  ),
);

const session = (over: Partial<HostedSession>): HostedSession => ({
  configured: false,
  signedIn: false,
  loading: false,
  fetchToken: () => Promise.resolve(undefined),
  ...over,
});

const wrap = (hosted: HostedSession) => (tree: React.ReactNode) => (
  <HostedSessionContext value={hosted}>{tree}</HostedSessionContext>
);

installMemoryStorage();

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

/** The homepage's own headline — nothing else in the product says it. */
const marketing = () => screen.queryByRole("heading", { name: /Run the fight/ });
/** The app's global nav row, which the marketing page does not draw. */
const appNav = () => screen.queryByRole("navigation", { name: "Sections" });

describe("the signed-out gate", () => {
  it("shows the homepage when there is neither credential", async () => {
    await renderAt(CAMPAIGN_LIST, wrap(session({})), "none");

    expect(marketing()).toBeInTheDocument();
    expect(appNav()).toBeNull();
  });

  it("shows the app to a pasted developer token, with no hosted sign-in at all", async () => {
    window.localStorage.setItem("taverns.token", "a-machine-token");
    await renderAt(CAMPAIGN_LIST, wrap(session({})), "none");

    expect(appNav()).toBeInTheDocument();
    expect(marketing()).toBeNull();
  });

  it("shows the app to a hosted session, with nothing in storage", async () => {
    await renderAt(CAMPAIGN_LIST, wrap(session({ configured: true, signedIn: true })), "none");

    expect(appNav()).toBeInTheDocument();
    expect(marketing()).toBeNull();
  });

  /**
   * The no-flash property, and the only place it can be asserted at all.
   *
   * A hosted provider says `signedIn: false` while it is still loading, which
   * is *unknown* rather than *no*. If the gate read it as a boolean, every
   * signed-in visitor would get the marketing homepage painted over the app for
   * as long as the vendor's script took — a flash nobody can catch in a test
   * that only looks at the settled state. Here the unsettled state is the state
   * under test: **neither page**, on purpose.
   */
  it("draws neither page while a configured provider is still deciding", async () => {
    await renderAt(CAMPAIGN_LIST, wrap(session({ configured: true, loading: true })), "none");

    expect(marketing()).toBeNull();
    expect(appNav()).toBeNull();
  });

  it("does not wait on a loading provider when a token is already pasted", async () => {
    window.localStorage.setItem("taverns.token", "a-machine-token");
    await renderAt(CAMPAIGN_LIST, wrap(session({ configured: true, loading: true })), "none");

    expect(appNav()).toBeInTheDocument();
  });
});

/**
 * The two routes the gate must not swallow, and the first is a security
 * property rather than a convenience: `#/join/<token>` previews an invitation
 * *before* the reader has an account, which is the whole point of it. A gate
 * that reached it would break the one flow designed to run with no credential,
 * and would do it silently — the homepage renders perfectly well over an
 * invitation.
 */
describe("the routes that render signed out", () => {
  it("still shows the invitation preview at #/join/<token>", async () => {
    await renderAt(`/join/${TOKEN}`, wrap(session({})), "none");

    expect(marketing()).toBeNull();
    expect(await screen.findByRole("heading", { name: "An invitation" })).toBeInTheDocument();
  });

  it("still shows the gallery, which is where a developer token is pasted", async () => {
    await renderAt("/gallery", wrap(session({})), "none");

    expect(marketing()).toBeNull();
    // `ServerPanel`'s own heading: the reason this route is exempt is that the
    // homepage's call to action points at it, and a gate over it would be a
    // circle nobody could get out of.
    expect(screen.getByRole("heading", { name: "Server" })).toBeInTheDocument();
  });
});
