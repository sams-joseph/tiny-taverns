import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { CampaignsScreen } from "./CampaignsScreen";

/**
 * The way in, now that an account can be at a table it does not run.
 *
 * One question and three answers: which endpoint it reads, what it says about a
 * table you are only a player at, and what it says when there is nothing —
 * which since the invite landed has two causes and must not name only one.
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

const renderList = (): void => {
  render(
    <HostedSessionContext value={session}>
      <CampaignsScreen route={{ screen: "campaigns" }} />
    </HostedSessionContext>,
  );
};

beforeEach(() => {
  routes.clear();
  calls.length = 0;
});

describe("the campaign list", () => {
  it("reads the membership list, and marks the tables you only sit at", async () => {
    routes.set("GET /me/campaigns", {
      status: 200,
      body: [
        { campaign: mine, role: "dm", joinedAt: stamps.createdAt },
        { campaign: theirs, role: "player", joinedAt: stamps.createdAt },
      ],
    });

    renderList();

    expect(await screen.findByText("The Salt Road")).toBeTruthy();
    expect(screen.getByText("The Hag's Bargain")).toBeTruthy();
    // The role is the one thing `GET /campaigns` cannot carry, because it is a
    // fact about the pair rather than about the campaign.
    expect(screen.getByText("Player")).toBeTruthy();
    // A player earns a badge and a DM does not: absence is what says "yours".
    expect(screen.getAllByText("Player")).toHaveLength(1);
    expect(calls).toContain("GET /me/campaigns");
    expect(calls).not.toContain("GET /campaigns");
  });

  it("says why a list can be empty without naming only one of the reasons", async () => {
    // Two causes since the invite landed — nobody has invited you, or the DM has
    // not shared the table you joined — and this screen cannot tell them apart
    // without a second read. So the copy covers both rather than guessing.
    routes.set("GET /me/campaigns", { status: 200, body: [] });

    renderList();

    expect(await screen.findByText("No tables yet")).toBeTruthy();
    expect(screen.getByText(/once its DM shares it/)).toBeTruthy();
  });
});
