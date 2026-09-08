import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  campaign,
  campaignId,
  character,
  installStubServer,
  mintingSession,
  npcId,
  readAloud,
  page,
} from "../campaign/campaign.fixtures";

/**
 * A table you sit at, chosen by this account's relation to the campaign.
 *
 * Much of what is under test is what it does *not* do. The player and creator
 * projections may diverge freely, and the reason this screen exists at all is
 * that the creator's load composes reads a player may not call. So the
 * assertions are: which endpoints it reaches (only ones a player may call), and
 * that no creator chrome is on it.
 *
 * The fixtures are the campaign screen's, for the reason that file gives — they
 * are the JSON the server sends, so a field the contract renames fails here
 * rather than rendering `undefined`.
 */

const server = installStubServer();
const session = mintingSession();

const renderScreen = async (): Promise<void> => {
  // The player's membership is what makes this URL render the participant
  // projection — the same URL the creator opens, chosen by relation.
  server.routes.set("GET /me/campaigns", {
    status: 200,
    body: [{ campaign, relation: "player", joinedAt: "2026-06-01T10:00:00.000Z" }],
  });
  await renderAt(`/campaigns/${campaignId}`, (screen) => (
    <HostedSessionScope session={session}>{screen}</HostedSessionScope>
  ));
};

const pathsCalled = (): ReadonlyArray<string> => server.calls.map((call) => call.pathname);

beforeEach(() => {
  server.reset();
});

describe("a table you sit at", () => {
  it("reads only what a player may read", async () => {
    await renderScreen();

    // Twice: the top nav's context, and the screen's own bar.
    expect(await screen.findAllByText(campaign.name)).toHaveLength(2);
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}`);
    // The party read — `party.list`, the seats over shared characters — is the
    // one a player may make; the old campaign-scoped character list is gone
    // with the continuity decision.
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}/party`);
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}/notes`);
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}/npcs/-/player`);
    // The creator's load composes these, and the creator gate refuses a player
    // the first of them — which is the whole reason this screen is not that
    // screen narrowed. The other two are screens of their own.
    expect(pathsCalled().some((path) => path.endsWith("/runs"))).toBe(false);
    expect(pathsCalled().some((path) => path.endsWith("/prep"))).toBe(false);
    expect(pathsCalled().some((path) => path.includes("/recap"))).toBe(false);
  });

  it("shows the party and what the DM shared, and offers no way to change either", async () => {
    await renderScreen();

    expect(await screen.findByText(character.name)).toBeTruthy();
    expect(screen.getByText(readAloud.title)).toBeTruthy();
    expect(screen.getByText(readAloud.body)).toBeTruthy();
    // Read-only, and structurally so: nothing here renders an editor.
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    // A player talks to Hob only from the character-drafting composer. The DM's
    // docked session-writing panel is not offered on this overview.
    expect(screen.queryByRole("button", { name: /Ask Hob/ })).toBeNull();
    const talk = screen.getByRole("button", { name: /Talk privately/ });
    expect(talk.getAttribute("href")).toBe(`/#/campaigns/${campaignId}/cast/${npcId}/talk`);
  });

  it("keeps the DM's nav off the player's bar", async () => {
    await renderScreen();

    expect(await screen.findByRole("link", { name: /Groups/ })).toBeTruthy();
    // Bestiary and the DM party-management screen are not player destinations;
    // a nav item that goes nowhere is the same lie as a stubbed field.
    expect(screen.queryByRole("link", { name: /Bestiary/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Party/ })).toBeNull();

    // *Chronicle* is here because its screen now is, and it points at the
    // player's own route — `recap.readAsPlayer`, not the gated `recap.read`.
    expect(screen.getByRole("link", { name: /Chronicle/ }).getAttribute("href")).toBe(
      `/#/campaigns/${campaignId}/chronicle`,
    );
  });

  it("says what an empty table means rather than looking broken", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, { status: 200, body: [] });
    server.routes.set(`GET /campaigns/${campaignId}/notes`, { status: 200, body: page([]) });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/player`, { status: 200, body: [] });

    await renderScreen();

    // The ordinary outcome of joining: a table its DM has shared but has put
    // nothing shared inside. The master toggle and the row-level one working in
    // sequence, not a gap.
    expect(await screen.findByText("Nothing shared yet")).toBeTruthy();
  });

  it("renders a failed load with a way to try it again", async () => {
    server.routes.delete(`GET /campaigns/${campaignId}`);

    await renderScreen();

    expect(await screen.findByRole("button", { name: /Try again/ })).toBeTruthy();
  });
});
