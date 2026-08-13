import { renderAt } from "../test/renderRoute";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";

/**
 * Following an invitation — the first screen a stranger sees.
 *
 * Four properties, and every one of them is about a person who does not have an
 * account yet:
 *
 *   - the campaign and the DM are named **before** anything asks who you are,
 *     which is the whole reason the preview endpoint is unauthenticated;
 *   - the token travels in a `POST` body and never in a query string, because
 *     the fragment it came from is the one place a browser will not send it;
 *   - a dead link gets one sentence, whichever kind of dead it is, because the
 *     server gives one answer for all four;
 *   - joining a campaign the DM has not shared says so, since that is the
 *     ordinary outcome and it otherwise reads as breakage.
 */

const TOKEN = "Nk9-b3JkZXJfb2ZfdGhlX2ZlcnJ5bWFu";
const campaignId = "2b1f2a1e-0000-4000-8000-00000000c0de";

const preview = {
  campaignName: "The Salt Road",
  dmName: "Ada",
  expiresAt: "2026-08-18T13:03:28.070Z",
};

interface Call {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
  readonly body: string;
}

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

const notFound: Answer = {
  status: 404,
  body: { _tag: "NotFound", resource: "invite", id: "" },
};

const routes = new Map<string, Answer>();
const calls: Array<Call> = [];

/**
 * One `fetch` stub, installed at module scope.
 *
 * `FetchHttpClient.Fetch` is a `Context.Reference` and `Context` memoises a
 * reference's default the first time it is read, so a per-test `vi.stubGlobal`
 * would keep serving the first test's answers with nothing to notice. Same rule
 * as `campaign.fixtures.tsx` and `api/client.test.ts`.
 */
vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
  const { pathname, search } = new URL(String(url));
  const method = init?.method ?? "GET";
  calls.push({
    method,
    pathname,
    search,
    body: init?.body === undefined ? "" : new TextDecoder().decode(init.body as Uint8Array),
  });
  const answer = routes.get(`${method} ${pathname}`) ?? notFound;
  return Promise.resolve(
    new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    }),
  );
});

/** Signed in through the hosted provider, so there is a seat to take. */
const signedIn: HostedSession = {
  configured: true,
  signedIn: true,
  fetchToken: () => Promise.resolve("session-token"),
};

const signedOut: HostedSession = {
  configured: true,
  signedIn: false,
  fetchToken: () => Promise.resolve(undefined),
};

const renderJoin = async (hosted: HostedSession = signedIn): Promise<void> => {
  await renderAt(`/join/${TOKEN}`, (screen) => (
    <HostedSessionContext value={hosted}>{screen}</HostedSessionContext>
  ));
};

beforeEach(() => {
  routes.clear();
  calls.length = 0;
});

describe("following an invitation", () => {
  it("names the campaign and the DM, and keeps the token out of the URL", async () => {
    routes.set("POST /invites/preview", { status: 200, body: preview });

    await renderJoin();

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText(/good until 18 August 2026, and only once/)).toBeTruthy();

    const call = calls.find((entry) => entry.pathname === "/invites/preview");
    // A `POST` with the token in the body: a path or a query string lands in
    // every log on the way, and the fragment it came from does not.
    expect(call?.method).toBe("POST");
    expect(call?.search).toBe("");
    expect(JSON.parse(call?.body ?? "{}")).toEqual({ token: TOKEN });
  });

  it("takes the seat, and says the DM has not shared the table yet", async () => {
    routes.set("POST /invites/preview", { status: 200, body: preview });
    routes.set("POST /invites/redeem", {
      status: 200,
      body: { campaignId, campaignName: "The Salt Road", shared: false },
    });

    await renderJoin();
    await userEvent.click(await screen.findByRole("button", { name: "Take your seat" }));

    expect(await screen.findByText(/You are at The Salt Road/)).toBeTruthy();
    // The ordinary outcome of joining, and the moment to explain it — a
    // campaign starts private, so the alternative is a blank page with no
    // explanation anywhere.
    expect(screen.getByText(/The DM has not shared this table yet/)).toBeTruthy();
    expect(JSON.parse(calls.find((c) => c.pathname === "/invites/redeem")?.body ?? "{}")).toEqual({
      token: TOKEN,
    });
  });

  it("points straight at a table that is already shared — at the player's screen", async () => {
    routes.set("POST /invites/preview", { status: 200, body: preview });
    routes.set("POST /invites/redeem", {
      status: 200,
      body: { campaignId, campaignName: "The Salt Road", shared: true },
    });

    await renderJoin();
    await userEvent.click(await screen.findByRole("button", { name: "Take your seat" }));

    // A real `<a href>` wearing the button recipe — `nativeButton={false}` is
    // what keeps the href while Base UI applies button semantics, so the role
    // is `button` and the destination is still a link somebody can copy.
    const open = await screen.findByRole("button", { name: /Open The Salt Road/ });
    // **The player's route, never the DM's.** Redeeming mints a `player`
    // membership; the DM's campaign screen composes `runs.list`, which is behind
    // the `DmActor` gate, so `#/campaigns/:c` would have answered a brand new
    // player a 404 on the first thing they pressed in the product.
    expect(open.getAttribute("href")).toBe(`/#/play/campaigns/${campaignId}`);
  });

  it("gives every dead link the same sentence", async () => {
    // Used, withdrawn, expired, invented: the server answers one `NotFound` for
    // all four, because distinguishing them for the holder of a bad token
    // discloses which kind of bad it is. The page says so in one sentence and
    // says what to do.
    routes.set("POST /invites/preview", notFound);

    await renderJoin();

    expect(await screen.findByText("This invitation is no longer good")).toBeTruthy();
    expect(screen.getByText(/Ask whoever sent it for a fresh one/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take your seat" })).toBeNull();
  });

  it("asks a signed-out reader to sign in rather than offering a seat it cannot give", async () => {
    routes.set("POST /invites/preview", { status: 200, body: preview });

    await renderJoin(signedOut);

    // The campaign is still named — that is the point of previewing before
    // sign-in — but there is nothing to press until there is an account to
    // keep the seat under.
    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Take your seat" })).toBeNull();
    expect(calls.some((call) => call.pathname === "/invites/redeem")).toBe(false);
  });
});
