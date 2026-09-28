import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { UNNAMED_NPC } from "@taverns/api";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  bodyOf,
  campaignId,
  castShelf,
  castShelfPrep,
  cazril,
  installStubServer,
  npcId,
  sessionId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";

/**
 * The Cast screen against a stubbed wire decoded by the real client: the
 * grid, the prep on each card and the counts, the two empty states, the
 * search and the pills, and *Add NPC*. The drawer a card
 * opens is `NpcDrawer.test.tsx`.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
});

afterEach(() => cleanup());

const renderCast = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/cast`, (screen) => (
    <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
  ));
};

describe("CastScreen", () => {
  it("draws the cast as cards, centred, on the campaign row", async () => {
    await renderCast();

    expect(await screen.findByRole("heading", { level: 1, name: "Cast" })).toBeInTheDocument();
    expect(screen.getByText("1 NPC · 0 met · 0 hostile")).toBeInTheDocument();
    // The Overview's centred frame, header and body both inside it.
    const frame = screen
      .getByRole("heading", { level: 1, name: "Cast" })
      .closest(".max-w-overview");
    expect(frame).not.toBeNull();
    expect(frame!.contains(screen.getByRole("link", { name: "Cazril" }))).toBe(true);
    const card = screen.getByRole("link", { name: "Cazril" }).closest('[data-slot="npc-card"]');
    expect(card).not.toBeNull();
    expect(
      within(card as HTMLElement).getByText("the ferryman at the crossing"),
    ).toBeInTheDocument();
    // And *Cast* is the lit item on the campaign row, between Party and Notes.
    const row = screen.getByRole("navigation", { name: "This campaign" });
    expect(within(row).getByRole("link", { name: "Cast" })).toHaveAttribute("aria-current", "page");
  });

  it("makes the card one link to the NPC's drawer, with nothing else on it", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, visibility: "shared" }],
    });
    await renderCast();

    const link = await screen.findByRole("link", { name: "Cazril" });
    expect(link).toHaveAttribute("href", `/campaigns/${campaignId}/cast?npc=${npcId}`);
    expect(link).toHaveAttribute("data-card-link");
    const card = link.closest('[data-slot="npc-card"]') as HTMLElement;
    expect(card.querySelectorAll("a, button")).toHaveLength(1);
    // What today's card carried and the drawn one drops: the sharing and
    // private-material badges, the summary line, and Edit and Rehearse.
    for (const gone of ["Player-facing", "Cast only", "Private material", "Rehearse"])
      expect(within(card).queryByText(gone)).toBeNull();
    expect(within(card).queryByText(/takes names instead of coin/)).toBeNull();
    expect(within(card).queryByRole("button", { name: /Edit/ })).toBeNull();
    // Nor does the Cast read what only those cues needed.
    expect(
      server.calls.filter(
        (call) => call.pathname.endsWith("/proposals") || call.pathname.includes("/-/sessions/"),
      ),
    ).toEqual([]);
  });

  it("draws a card per NPC, with Hob's drawing only where it is on its way", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, { status: 200, body: castShelf });
    await renderCast();

    await screen.findByRole("link", { name: "Grusk" });
    expect(screen.getByText("5 NPCs · 0 met · 0 hostile")).toBeInTheDocument();
    const cards = document.querySelectorAll('[data-slot="npc-card"]');
    expect(cards).toHaveLength(5);
    const drawing = screen.getByRole("status");
    expect(drawing).toHaveTextContent("Hob is drawing…");
    expect(drawing.closest('[data-slot="npc-card"]')).toBe(
      screen.getByRole("link", { name: "Grusk" }).closest('[data-slot="npc-card"]'),
    );
    // No role is no line, not a placeholder.
    const joss = screen.getByRole("link", { name: "Joss" }).closest('[data-slot="npc-card"]')!;
    expect(joss.querySelectorAll("p")).toHaveLength(0);
  });

  it("keeps the header to Archived and Add NPC, and neither is peach", async () => {
    await renderCast();
    await screen.findByRole("link", { name: "Cazril" });

    const heading = document.querySelector('main [data-slot="page-heading"]') as HTMLElement;
    expect(
      within(heading)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Archived", "Add NPC"]);
    expect(within(heading).getByRole("button", { name: "Archived" })).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/cast/archived`,
    );
    for (const button of within(heading).getAllByRole("button"))
      expect(button).not.toHaveClass("bg-accent");
    expect(screen.queryByRole("button", { name: /NPC follow-up/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add from Library/ })).toBeNull();
  });

  it("says what to do first over an empty cast, with no filter row", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, { status: 200, body: [] });
    await renderCast();

    expect(await screen.findByText("Nobody in the cast yet")).toBeInTheDocument();
    expect(screen.getByText("No NPCs yet")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Search the cast" })).toBeNull();
  });

  it("draws each NPC's prep on its card, and nothing that was never set", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, { status: 200, body: castShelf });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/prep`, {
      status: 200,
      body: castShelfPrep(sessionId),
    });
    await renderCast();
    await screen.findByRole("link", { name: "Grusk" });

    // Every live NPC, the met and the hostile, whatever the filter shows.
    expect(screen.getByText("5 NPCs · 3 met · 2 hostile")).toBeInTheDocument();
    const card = (name: string) =>
      screen.getByRole("link", { name }).closest('[data-slot="npc-card"]') as HTMLElement;
    const badges = (name: string) =>
      Array.from(card(name).querySelectorAll('[data-slot="npc-card-badges"] > *')).map(
        (badge) => badge.textContent,
      );

    const grusk = card("Grusk");
    expect(badges("Grusk")).toEqual(["Hostile", "Captive"]);
    expect(within(grusk).getByText("Hostile")).toHaveClass("bg-danger");
    expect(within(grusk).getByText("Captive")).toHaveClass("bg-info-soft");
    expect(within(grusk).getByText(/Toll bridge on the Vell road/)).toBeInTheDocument();
    expect(within(grusk).getByText("First met in session 12")).toBeInTheDocument();
    expect(within(card("Master Hollis")).getByText("Friendly")).toHaveClass("bg-success-soft");
    expect(within(card("Mother Sallow")).getByText("Unknown")).toHaveClass("bg-surface-raised");
    expect(within(card("Mother Sallow")).getByText("Not met yet")).toBeInTheDocument();
    // Alive is the ordinary state: the attitude is badged, the status is not.
    expect(within(card("Cazril")).getByText("Indifferent")).toHaveClass("border-strong");
    expect(within(card("Cazril")).queryByText("Alive")).toBeNull();
    // Nothing set is no badge and no *where*, never a placeholder — only the
    // met line, since an unset *first met* means "not met yet".
    expect(badges("Joss")).toEqual([]);
    expect(card("Joss").querySelector('[data-slot="npc-card-lines"]')).toHaveTextContent(
      /^Not met yet$/,
    );
    expect(within(card("Joss")).queryByText("Somewhere")).toBeNull();
  });

  it("narrows by the two pill groups, ANDed with the search, and the lit attitude clears", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, { status: 200, body: castShelf });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/prep`, {
      status: 200,
      body: castShelfPrep(sessionId),
    });
    await renderCast();
    await screen.findByRole("link", { name: "Grusk" });
    const shown = () =>
      Array.from(document.querySelectorAll('[data-slot="npc-card"] [data-card-link]')).map(
        (link) => link.textContent,
      );
    const met = screen.getByRole("group", { name: "Filter by meeting" });
    const attitude = screen.getByRole("group", { name: "Filter by attitude" });
    const pill = (group: HTMLElement, name: string) => within(group).getByRole("button", { name });
    expect(pill(met, "Everyone")).toHaveAttribute("aria-pressed", "true");
    expect(shown()).toHaveLength(5);

    await userEvent.click(pill(met, "Met"));
    expect(shown()).toEqual(["Cazril", "Master Hollis", "Grusk"]);
    expect(pill(met, "Everyone")).toHaveAttribute("aria-pressed", "false");
    // Pressing the lit met pill leaves it lit: one of the three always is.
    await userEvent.click(pill(met, "Met"));
    expect(pill(met, "Met")).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(pill(attitude, "Hostile"));
    expect(shown()).toEqual(["Grusk"]);
    await userEvent.click(pill(met, "Not met yet"));
    expect(shown()).toEqual(["Mother Sallow"]);
    // The lit attitude pressed again clears it.
    await userEvent.click(pill(attitude, "Hostile"));
    expect(pill(attitude, "Hostile")).toHaveAttribute("aria-pressed", "false");
    expect(shown()).toEqual(["Mother Sallow", "Joss"]);

    // The search reaches *where*, and ANDs with the pills.
    await userEvent.type(screen.getByRole("combobox", { name: "Search the cast" }), "marsh");
    await waitFor(() => expect(shown()).toEqual(["Mother Sallow"]));
    await userEvent.click(pill(met, "Met"));
    expect(await screen.findByText("Nobody here")).toBeInTheDocument();
    // The counts are the cast's, not the filter's.
    expect(screen.getByText("5 NPCs · 3 met · 2 hostile")).toBeInTheDocument();
  });

  it("searches the cast in the body, and says when nobody answers", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, { status: 200, body: castShelf });
    await renderCast();
    await screen.findByRole("link", { name: "Grusk" });

    const search = screen.getByRole("combobox", { name: "Search the cast" });
    expect(search.closest('[data-slot="cast-filters"]')).not.toBeNull();
    await userEvent.type(search, "troll");
    await waitFor(() =>
      expect(document.querySelectorAll('[data-slot="npc-card"]')).toHaveLength(1),
    );
    expect(screen.getByRole("link", { name: "Grusk" })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "innkeeper");
    expect(await screen.findByText("Nobody here")).toBeInTheDocument();
    // The count is the cast's, not the search's.
    expect(screen.getByText("5 NPCs · 0 met · 0 hostile")).toBeInTheDocument();
  });

  it("adds a blank NPC at once and opens its drawer with the name focused", async () => {
    const created = { ...blank, id: "2b1f2a1e-0000-4000-8000-00000000d0c2" };
    server.routes.set(`POST /campaigns/${campaignId}/npcs`, { status: 200, body: created });
    await renderCast();
    await userEvent.type(
      await screen.findByRole("combobox", { name: "Search the cast" }),
      "nobody by this name",
    );
    await userEvent.click(screen.getByRole("button", { name: "Not met yet" }));
    await userEvent.click(screen.getByRole("button", { name: "Hostile" }));
    expect(await screen.findByText("Nobody here")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add NPC" }));

    // Blank, under the one placeholder name, and the DM's alone: nothing for
    // Hob to draw from yet, so no portrait is started by the create.
    await waitFor(() =>
      expect(bodyOf(server, "POST", "/npcs")).toEqual({ name: UNNAMED_NPC, visibility: "dm" }),
    );
    const drawer = await screen.findByRole("dialog", { name: UNNAMED_NPC });
    expect(new URLSearchParams(globalThis.location.search).get("npc")).toBe(created.id);
    const name = within(drawer).getByRole("textbox", { name: "Name" });
    // The placeholder is the stored name, not something typed: the field is empty.
    expect(name).toHaveValue("");
    await waitFor(() => expect(name).toHaveFocus());
    expect(within(drawer).queryByRole("alert")).toBeNull();
    // The search is cleared, so the new card is on the grid behind it (hidden
    // from the accessibility tree while the modal is open), and counted.
    expect(screen.getByRole("link", { name: UNNAMED_NPC, hidden: true })).toBeInTheDocument();
    expect(screen.getByText("2 NPCs · 0 met · 0 hostile")).toBeInTheDocument();
    // And both pill groups are back to showing everyone.
    const filters = document.querySelector('[data-slot="cast-filters"]') as HTMLElement;
    expect(within(filters).getByRole("button", { name: "Everyone", hidden: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(filters).getByRole("button", { name: "Hostile", hidden: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("closes a drawer the cast does not list, and says nothing is chosen", async () => {
    await renderAt(`/campaigns/${campaignId}/cast?npc=2b1f2a1e-0000-4000-8000-00000000dead`);
    await screen.findByRole("link", { name: "Cazril" });

    await waitFor(() => expect(globalThis.location.search).toBe(""));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/** An NPC as *Add NPC* makes one. */
const blank = {
  ...cazril,
  name: UNNAMED_NPC,
  role: "",
  persona: {},
  privateMaterial: {},
  version: 1,
};
