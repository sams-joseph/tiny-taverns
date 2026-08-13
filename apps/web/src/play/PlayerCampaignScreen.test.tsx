import { renderAt } from "../test/renderRoute";
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { HostedSessionContext } from "../auth/hostedSession";
import {
  campaign,
  campaignId,
  character,
  installStubServer,
  mintingSession,
  readAloud,
} from "../campaign/campaign.fixtures";

/**
 * A table you sit at — the first screen in the product that is not the DM's.
 *
 * Much of what is under test is what it does *not* do. A mode means the two
 * sides may diverge freely, and the reason this screen exists at all is that
 * the DM's composes `runs.list`, which the `DmActor` gate refuses a player. So
 * the assertions are: which endpoints it reaches (only ones a player may call),
 * and that no DM chrome is on it.
 *
 * The fixtures are the campaign screen's, for the reason that file gives — they
 * are the JSON the server sends, so a field the contract renames fails here
 * rather than rendering `undefined`.
 */

const server = installStubServer();
const session = mintingSession();

const renderScreen = async (): Promise<void> => {
  await renderAt(`/play/campaigns/${campaignId}`, (screen) => (
    <HostedSessionContext value={session}>{screen}</HostedSessionContext>
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
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}/characters`);
    expect(pathsCalled()).toContain(`/campaigns/${campaignId}/notes`);
    // The DM's load composes these, and the `DmActor` gate refuses a player the
    // first of them — which is the whole reason this screen is not that screen
    // narrowed. The other two are screens of their own with steps of their own.
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
    // Asking is a write, and the captain settled that players do not talk to
    // Hob. The shell drops the button in player mode rather than opening a
    // panel that can only apologise.
    expect(screen.queryByRole("button", { name: /Ask Hob/ })).toBeNull();
  });

  it("keeps the DM's nav off the player's bar", async () => {
    await renderScreen();

    expect(await screen.findByRole("link", { name: /Tables/ })).toBeTruthy();
    // The bestiary and the party are the DM's — `members.list` is gated and a
    // player's projection of a roster is nothing at all — and a nav item that
    // goes nowhere is the same lie as a stubbed field.
    expect(screen.queryByRole("link", { name: /Bestiary/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Party/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Campaigns/ })).toBeNull();

    // *Chronicle* is here because its screen now is, and it points at the
    // player's own route — `recap.readAsPlayer`, not the gated `recap.read`.
    expect(screen.getByRole("link", { name: /Chronicle/ }).getAttribute("href")).toBe(
      `/#/play/campaigns/${campaignId}/chronicle`,
    );
  });

  it("says what an empty table means rather than looking broken", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/characters`, { status: 200, body: [] });
    server.routes.set(`GET /campaigns/${campaignId}/notes`, { status: 200, body: [] });

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
