import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { renderAt } from "../test/renderRoute";

/**
 * The gate, in every state it has — which is the part of this work a future
 * session will most need to be able to check.
 *
 * It shows when nobody is signed in. The case with no visible symptom until it
 * is wrong is a
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

afterEach(cleanup);

/** The homepage's own headline — nothing else in the product says it. */
const marketing = () => screen.queryByRole("heading", { name: /Run the fight/ });
/** The app's global nav row, which the marketing page does not draw. */
const appNav = () => screen.queryByRole("navigation", { name: "Sections" });

describe("the signed-out gate", () => {
  it("shows the homepage when nobody is signed in", async () => {
    await renderAt(CAMPAIGN_LIST, wrap(session({})), "none");

    expect(marketing()).toBeInTheDocument();
    expect(appNav()).toBeNull();
  });

  it("shows the app to a hosted session", async () => {
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
});

/**
 * The route the gate must not swallow, and it is a security property rather
 * than a convenience: `/join/<token>` previews an invitation
 * *before* the reader has an account, which is the whole point of it. A gate
 * that reached it would break the one flow designed to run with no credential,
 * and would do it silently — the homepage renders perfectly well over an
 * invitation.
 */
describe("the route that renders signed out", () => {
  it("still shows the invitation preview at /join/<token>", async () => {
    await renderAt(`/join/${TOKEN}`, wrap(session({})), "none");

    expect(marketing()).toBeNull();
    expect(await screen.findByRole("heading", { name: "An invitation" })).toBeInTheDocument();
  });
});
