import { renderAt } from "../test/renderRoute";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";

/**
 * The way in, now that an account can be at a table it does not run **and the
 * role switch is a mode.**
 *
 * One endpoint answers both sides — `GET /me/campaigns` carries the role — so
 * what is under test is the branch: which rows each side shows, where a row
 * goes, and which affordances belong to which side.
 *
 * The pill itself is no longer this screen's to offer — it is the shell's, for
 * every screen, drawn off the route (see `shell/AppShell.test.tsx`). What is
 * pinned here is that it reaches the account that needs it most: a DM
 * everywhere and a player nowhere, which is every account that predates the
 * invitation and the state the captain was in when the switch was invisible.
 */

const stamps = { createdAt: "2026-08-04T13:03:28.070Z", updatedAt: "2026-08-04T13:03:28.070Z" };
const provenance = { origin: "authored", assistantTurnId: null };

const campaign = (id: string, name: string, visibility = "dm") => ({
  id,
  name,
  partyName: null,
  playerCount: 4,
  currentSessionId: null,
  visibility,
  archivedAt: null,
  ...provenance,
  ...stamps,
});

const mine = campaign("2b1f2a1e-0000-4000-8000-00000000c0de", "The Salt Road");
const theirs = campaign("2b1f2a1e-0000-4000-8000-00000000c0df", "The Hag's Bargain", "shared");

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

const routes = new Map<string, Answer>();
const calls: Array<string> = [];

/** One `fetch` stub at module scope — see `campaign.fixtures.tsx` for why. */
vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
  const { pathname } = new URL(String(url));
  const method = init?.method ?? "GET";
  calls.push(`${method} ${pathname}`);
  const answer = routes.get(`${method} ${pathname}`) ?? { status: 200, body: [] };
  return Promise.resolve(
    new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    }),
  );
});

const session: HostedSession = {
  configured: true,
  signedIn: true,
  fetchToken: () => Promise.resolve("session-token"),
};

/** The DM's list by default; `/play` is the same screen answering the other question. */
const renderList = async (path = "/campaigns"): Promise<void> => {
  await renderAt(path, (screen) => (
    <HostedSessionContext value={session}>{screen}</HostedSessionContext>
  ));
};

const bothSides = [
  { campaign: mine, role: "dm", joinedAt: stamps.createdAt },
  { campaign: theirs, role: "player", joinedAt: stamps.createdAt },
];

beforeEach(() => {
  routes.clear();
  calls.length = 0;
});

describe("the campaign list", () => {
  it("reads the membership list, and shows only the tables you run", async () => {
    routes.set("GET /me/campaigns", { status: 200, body: bothSides });

    await renderList();

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    // A mode, not a filter: the table you only sit at is not this list's
    // subject. It is one press away rather than a badged row here, and the
    // badge is gone with it — under a mode every row has the same role, so a
    // badge on all of them would say nothing.
    expect(screen.queryByText("The Hag's Bargain")).toBeNull();
    // The only *Player* on the page is the pill. The row badge is gone with the
    // mixed list: under a mode every row has the same role, so a badge on all
    // of them would say nothing.
    expect(screen.getAllByText("Player")).toHaveLength(1);
    expect(screen.getByText("Player").closest("a")?.getAttribute("href")).toBe("/#/play");
    expect(calls).toContain("GET /me/campaigns");
    expect(calls).not.toContain("GET /campaigns");
  });

  it("sends a player's row to the player's screen, not to the DM's", async () => {
    // The whole point of the branch. `CampaignScreen` composes `runs.list`,
    // which is behind the `DmActor` gate, so a player following this link would
    // be answered a 404 by the first screen they ever saw.
    routes.set("GET /me/campaigns", { status: 200, body: bothSides });

    await renderList("/play");

    expect((await screen.findByText("The Hag's Bargain")).getAttribute("href")).toBe(
      `/#/play/campaigns/${theirs.id}`,
    );
    expect(screen.getByRole("button", { name: /Open/ }).getAttribute("href")).toBe(
      `/#/play/campaigns/${theirs.id}`,
    );
  });

  it("offers the switch to an account that is a DM everywhere and a player nowhere", async () => {
    // The old rule hid it until a `player` membership existed, which is the
    // state every account that predates the invitation is in — and it was
    // circular: you could not reach player mode until you were a player, and
    // the control that takes you there was hidden until you were one. The way
    // in for a DM handed somebody else's link is this pill, so it is here
    // whatever the memberships say, and `#/play` says its own empty state.
    routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign: mine, role: "dm", joinedAt: stamps.createdAt }],
    });

    await renderList();

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Player" }).getAttribute("href")).toBe("/#/play");
    expect(screen.getByRole("link", { name: "DM" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers it before the memberships have even loaded", async () => {
    // It is the shell's, drawn from the route, so it does not wait on a read —
    // which is also why no future screen has to remember to ask for it.
    await renderList();

    expect(screen.getByText("Looking for your campaigns…")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Player" }).getAttribute("href")).toBe("/#/play");
    // Let the read land, so the pending update belongs to this test.
    expect(await screen.findByText("No campaigns yet")).toBeTruthy();
  });

  it("offers the switch as two links once one exists, and never as state", async () => {
    routes.set("GET /me/campaigns", { status: 200, body: bothSides });

    await renderList();

    // Two links and no state: that is how a mode survives a reload, a bookmark
    // and a middle click, and how it cannot disagree with the URL.
    expect((await screen.findByRole("link", { name: "Player" })).getAttribute("href")).toBe(
      "/#/play",
    );
    const dm = screen.getByRole("link", { name: "DM" });
    expect(dm.getAttribute("href")).toBe("/#/campaigns");
    expect(dm.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the switch on the player side even with nothing there, so it is not a dead end", async () => {
    routes.set("GET /me/campaigns", { status: 200, body: [] });

    await renderList("/play");

    expect((await screen.findByRole("link", { name: "DM" })).getAttribute("href")).toBe(
      "/#/campaigns",
    );
  });

  it("keeps the DM's chrome off the player side", async () => {
    // Creating a campaign makes you its DM in the same transaction, so the one
    // write on the way in belongs to the DM side; and asking Hob is a write, so
    // a player is refused by the existing rule. Both are absent rather than
    // present and failing.
    routes.set("GET /me/campaigns", { status: 200, body: bothSides });

    await renderList("/play");

    expect(await screen.findByText("The Hag's Bargain")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start a campaign" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ask Hob/ })).toBeNull();
  });

  it("says why each side is empty without naming only one of the reasons", async () => {
    // The player side has two causes and cannot tell them apart without a
    // second read — nobody has invited you, or the DM of a table you joined has
    // not shared it — so the copy covers both rather than guessing.
    routes.set("GET /me/campaigns", { status: 200, body: [] });

    await renderList("/play");

    expect(await screen.findByText("No table yet")).toBeTruthy();
    expect(screen.getByText(/once its DM shares it/)).toBeTruthy();
  });

  it("says something else when you run nothing", async () => {
    routes.set("GET /me/campaigns", { status: 200, body: [] });

    await renderList();

    expect(await screen.findByText("No campaigns yet")).toBeTruthy();
  });

  it("renders a failed load with a way to try it again", async () => {
    routes.set("GET /me/campaigns", { status: 500, body: { message: "no" } });

    await renderList();

    expect(await screen.findByRole("button", { name: /Try again/ })).toBeTruthy();
  });
});
