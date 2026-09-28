import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import { campaignId, cazril, installStubServer, npcId } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";

/**
 * The archived shelf, and the round trip it exists for: archiving an NPC is
 * only reversible if something leads back to it. The drawer's *Archive* takes
 * it off the Cast, the Cast's *Archived* link opens the shelf, and *Restore*
 * there puts it back.
 *
 * The stub answers the list the way the server does, by the query: the live
 * list without `archived`, the shelf with `archived=true`. So the shelf is
 * proven to ask for the other shelf rather than filter the live one.
 */

const server = installStubServer();

const archivedAt = "2026-09-20T18:00:00.000Z";

/** One NPC that moves between the shelves as the stub is written to. */
const stateful = () => {
  let archived = false;
  const row = () => ({ ...cazril, archivedAt: archived ? archivedAt : null });
  const askedForArchived = () => server.calls.at(-1)?.search.includes("archived=true") === true;
  server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
    status: 200,
    body: () => (askedForArchived() === archived ? [row()] : []),
  });
  server.routes.set(`GET /campaigns/${campaignId}/npcs/${npcId}`, { status: 200, body: row });
  server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/archive`, {
    status: 200,
    body: () => {
      archived = true;
      return row();
    },
  });
  server.routes.set(`POST /campaigns/${campaignId}/npcs/${npcId}/restore`, {
    status: 200,
    body: () => {
      archived = false;
      return row();
    },
  });
  return { archive: () => (archived = true) };
};

const renderPath = async (path: string): Promise<void> => {
  await renderAt(path, (screen) => (
    <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
  ));
};

beforeEach(() => {
  server.reset();
});

afterEach(() => cleanup());

describe("ArchivedCastScreen", () => {
  it("takes an NPC off the Cast, finds it on the shelf, and restores it", async () => {
    stateful();
    await renderPath(`/campaigns/${campaignId}/cast?npc=${npcId}`);

    const drawer = await screen.findByRole("dialog", { name: "Cazril" });
    await userEvent.click(within(drawer).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(globalThis.location.search).toBe("");
    expect(await screen.findByText("Nobody in the cast yet")).toBeInTheDocument();

    const link = screen.getByRole("button", { name: "Archived" });
    expect(link).toHaveAttribute("href", `/campaigns/${campaignId}/cast/archived`);
    await userEvent.click(link);

    expect(await screen.findByRole("heading", { name: "Archived NPCs" })).toBeInTheDocument();
    const card = (await screen.findByRole("link", { name: "Cazril" })).closest("li");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("Archived 20 September 2026")).toBeInTheDocument();
    expect(screen.getByText("1 NPC off the Cast")).toBeInTheDocument();
    // The shelf asked the server for the other shelf; it did not re-filter.
    expect(
      server.calls.some(
        (call) =>
          call.method === "GET" &&
          call.pathname === `/campaigns/${campaignId}/npcs` &&
          call.search.includes("archived=true"),
      ),
    ).toBe(true);

    await userEvent.click(within(card!).getByRole("button", { name: "Restore" }));
    expect(await screen.findByText("Nothing archived")).toBeInTheDocument();
    expect(
      server.calls.filter((call) => call.method === "POST").map((call) => call.pathname),
    ).toEqual([
      `/campaigns/${campaignId}/npcs/${npcId}/archive`,
      `/campaigns/${campaignId}/npcs/${npcId}/restore`,
    ]);

    await userEvent.click(screen.getByRole("link", { name: "All NPCs" }));
    await waitFor(() => expect(globalThis.location.pathname).toBe(`/campaigns/${campaignId}/cast`));
    expect(await screen.findByRole("link", { name: "Cazril" })).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/cast?npc=${npcId}`,
    );
  });

  it("opens the NPC's own page from the card, and keeps Cast lit on the campaign row", async () => {
    stateful().archive();
    await renderPath(`/campaigns/${campaignId}/cast/archived`);

    const name = await screen.findByRole("link", { name: "Cazril" });
    expect(name).toHaveAttribute("href", `/campaigns/${campaignId}/cast/${npcId}`);
    expect(name).toHaveAttribute("data-card-link");
    const row = screen.getByRole("navigation", { name: "This campaign" });
    expect(within(row).getByRole("link", { name: "Cast" })).toHaveAttribute("aria-current", "page");
  });
});
