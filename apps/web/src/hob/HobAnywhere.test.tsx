import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { campaign, campaignId, installStubServer, worldId } from "../campaign/campaign.fixtures";
import { sseFrames } from "../characters/characters.fixtures";
import { renderAt } from "../test/renderRoute";

/**
 * Hob on every screen, through the real shell and the real routes.
 *
 * `conversation.test.tsx` holds the conversation still with a named scope; this
 * is the other half — the scope and the starters **read off the route**, which
 * is where "Hob needs a campaign" used to be true. Outside a campaign or a
 * Shared World the panel is the account's own (`/me/hob`) and offers what that
 * toolkit drafts; inside a campaign it is that campaign's, exactly as before.
 */

const server = installStubServer();

const threadId = "2b1f2a1e-0000-4000-8000-00000000b001";
const turnId = "2b1f2a1e-0000-4000-8000-00000000b002";

/** The account's Hob, configured, with no conversation yet. */
const accountHob = () => {
  server.routes.set("GET /me/hob", {
    status: 200,
    body: { available: true, model: "scripted-local" },
  });
  server.routes.set("GET /me/hob/threads", { status: 200, body: [] });
};

beforeEach(() => {
  server.reset();
  accountHob();
});

afterEach(cleanup);

const panel = () => screen.getByRole("region", { name: "Hob" });

/** The empty conversation's starters, in the order they are drawn. */
const starters = () =>
  within(panel())
    .getAllByRole("button")
    .map((button) => button.querySelector(".font-medium")?.textContent ?? "")
    .filter((title) => title !== "");

const openHob = async () => {
  await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));
  await waitFor(() =>
    expect(within(panel()).queryByRole("textbox", { name: "Ask Hob" })).not.toBeNull(),
  );
};

describe("Hob outside a campaign", () => {
  it("answers on the Campaigns list from the account's own thread", async () => {
    await renderAt("/campaigns");
    await screen.findByRole("heading", { level: 1, name: "Campaigns" });
    await openHob();

    expect(server.calls.map((call) => call.pathname)).toContain("/me/hob");
    expect(
      server.calls.some((call) => /^\/(campaigns|worlds)\/[^/]+\/hob/.test(call.pathname)),
    ).toBe(false);
    // The list already holds a table this account runs and a world it is in.
    // It does not hold the roster, so it says nothing about how many.
    expect(starters()).toEqual([
      "Draft another campaign",
      "Draft a campaign in one of my Shared Worlds",
      "Draft a character",
    ]);
  });

  it("says first on an empty Campaigns list, and offers no world it is not in", async () => {
    server.routes.set("GET /me/campaigns", { status: 200, body: [] });
    server.routes.set("GET /worlds", { status: 200, body: [] });
    await renderAt("/campaigns");
    await openHob();

    expect(starters()).toEqual(["Draft my first campaign", "Draft a character"]);
  });

  it("puts a character first on the roster", async () => {
    server.routes.set("GET /me/characters", { status: 200, body: [] });
    await renderAt("/characters");
    await openHob();

    expect(starters()).toEqual(["Draft my first character", "Draft a campaign"]);
  });

  it("offers the same two drafts in the Library, and never campaign prep", async () => {
    await renderAt("/library");
    await openHob();

    expect(starters()).toEqual(["Draft a character", "Draft a campaign"]);
    expect(within(panel()).queryByText("Build an encounter")).toBeNull();
  });

  it("keeps a drafted campaign and opens it", async () => {
    server.routes.set("POST /me/hob/ask", {
      status: 200,
      sse: sseFrames([
        { event: "began", data: { threadId, turnId } },
        { event: "delta", data: { text: "Here is your table." } },
        {
          event: "proposal",
          data: {
            turnId,
            proposal: {
              target: "campaign",
              name: campaign.name,
              partyName: null,
              description: "Salt flats and a road nobody finishes.",
              world: null,
            },
          },
        },
        { event: "done", data: { reason: "stop" } },
      ]),
    });
    server.routes.set(`POST /me/hob/threads/${threadId}/turns/${turnId}/accept`, {
      status: 200,
      body: {
        accepted: "campaign",
        campaign: { ...campaign, origin: "assistant", assistantTurnId: turnId },
      },
    });
    await renderAt("/campaigns");
    await openHob();

    await userEvent.click(within(panel()).getByRole("button", { name: /Draft another campaign/ }));
    expect(await within(panel()).findByText("Salt flats and a road nobody finishes.")).toBeTruthy();
    const ask = server.calls.find((call) => call.pathname === "/me/hob/ask");
    // The starter is the question, and the panel names no intent.
    expect(JSON.parse(ask?.body ?? "{}")).toEqual({ text: "Draft another campaign" });

    await userEvent.click(within(panel()).getByRole("button", { name: "Keep it" }));

    await waitFor(() => expect(window.location.pathname).toBe(`/campaigns/${campaignId}`));
    const accepts = server.calls.filter((call) => call.pathname.endsWith("/accept"));
    expect(accepts.map((call) => call.body)).toEqual(["{}"]);
    // Inside the campaign the panel is that campaign's again.
    await waitFor(() =>
      expect(server.calls.map((call) => call.pathname)).toContain(`/campaigns/${campaignId}/hob`),
    );
  });
});

describe("Hob inside a campaign or a Shared World is unchanged", () => {
  it("is the campaign's, with the campaign's starters", async () => {
    await renderAt(`/campaigns/${campaignId}`);
    await screen.findByRole("heading", { level: 1, name: "The Salt Road" });
    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));

    await waitFor(() =>
      expect(server.calls.map((call) => call.pathname)).toContain(`/campaigns/${campaignId}/hob`),
    );
    expect(server.calls.some((call) => call.pathname.startsWith("/me/hob"))).toBe(false);
    expect(within(panel()).getByText("Build an encounter")).toBeTruthy();
    expect(within(panel()).queryByText(/Draft (a|another) campaign/)).toBeNull();
  });

  it("is the Shared World's on its screen", async () => {
    await renderAt(`/worlds/${worldId}`);
    await userEvent.click(screen.getByRole("button", { name: /Ask Hob/ }));

    await waitFor(() =>
      expect(server.calls.map((call) => call.pathname)).toContain(`/worlds/${worldId}/hob`),
    );
    expect(within(panel()).getByText("What connects our campaigns?")).toBeTruthy();
    expect(within(panel()).queryByText(/Draft (a|another) campaign/)).toBeNull();
  });
});
