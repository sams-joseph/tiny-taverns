import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  bodyOf,
  campaignId,
  castShelf,
  cazril,
  installStubServer,
  npcId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";

/**
 * The Cast screen against a stubbed wire decoded by the real client: the
 * grid, the two empty states, and the builder — including the one property
 * the builder exists to keep, that what is typed under *Private material*
 * leaves the browser in `privateMaterial` and never in `persona`.
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
    expect(screen.getByText("1 NPC")).toBeInTheDocument();
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

  it("makes the card one link to the NPC's page, with nothing else on it", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, {
      status: 200,
      body: [{ ...cazril, visibility: "shared" }],
    });
    await renderCast();

    const link = await screen.findByRole("link", { name: "Cazril" });
    expect(link).toHaveAttribute("href", `/campaigns/${campaignId}/cast/${npcId}`);
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
    expect(screen.getByText("5 NPCs")).toBeInTheDocument();
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
    expect(screen.getByText("5 NPCs")).toBeInTheDocument();
  });

  it("writes a new NPC with the secret in its own document, then goes to rehearse it", async () => {
    const created = { ...cazril, id: "2b1f2a1e-0000-4000-8000-00000000d0c2", name: "Fen" };
    server.routes.set(`POST /campaigns/${campaignId}/npcs`, { status: 200, body: created });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}`, {
      status: 200,
      body: created,
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}/rehearsal`, {
      status: 200,
      body: {
        available: false,
        model: null,
        npc: "Fen",
        templateVersion: "npc-prompt/1.1.0",
        estimatedTokens: 90,
        knowledgeIncluded: 0,
        knowledgeTotal: 0,
        memoriesIncluded: 0,
        memoriesTotal: 0,
      },
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}/knowledge`, {
      status: 200,
      body: [],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}/memories`, {
      status: 200,
      body: [],
    });
    server.routes.set(`GET /campaigns/${campaignId}/npcs/${created.id}/threads`, {
      status: 200,
      body: [],
    });
    await renderCast();
    await screen.findByRole("link", { name: "Cazril" });

    await userEvent.click(screen.getByRole("button", { name: "Add NPC" }));
    const dialog = await screen.findByRole("dialog", { name: "New NPC" });
    // Basic first: the advanced half is behind a press, and the private
    // section is not on screen until it is opened.
    expect(within(dialog).queryByLabelText("Secrets")).toBeNull();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Fen");
    await userEvent.type(within(dialog).getByLabelText("Role"), "the patron");
    await userEvent.type(within(dialog).getByLabelText("Who they are"), "Pays for silence.");
    // On the first screen, because the portrait is drawn from it as the NPC lands.
    await userEvent.type(within(dialog).getByLabelText("Appearance"), "Rings on every finger.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Advanced" }));
    await userEvent.type(within(dialog).getByLabelText("Secrets"), "Fen hired the hag.");
    await userEvent.type(within(dialog).getByLabelText("Phrases they use"), "Quiet, now.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create NPC" }));

    // What left the browser: the public document and the private one, apart.
    await waitFor(() =>
      expect(
        server.calls.some((call) => call.method === "POST" && call.pathname.endsWith("/npcs")),
      ).toBe(true),
    );
    const sent = bodyOf(server, "POST", "/npcs") as {
      readonly persona: unknown;
      readonly privateMaterial: unknown;
    };
    expect(sent).toMatchObject({
      name: "Fen",
      role: "the patron",
      persona: {
        identity: { summary: "Pays for silence.", appearance: "Rings on every finger." },
        voice: { phrases: ["Quiet, now."] },
      },
      privateMaterial: { secrets: "Fen hired the hag." },
      // A new NPC is kept to the DM until the switch says otherwise.
      visibility: "dm",
    });
    expect(JSON.stringify(sent.persona)).not.toContain("hired the hag");

    // A new NPC lands on its own screen, where the rehearsal is.
    await waitFor(() =>
      expect(globalThis.location.pathname).toBe(`/campaigns/${campaignId}/cast/${created.id}`),
    );
  }, 20_000);

  it("refuses to create a nameless NPC, in the form, before any request", async () => {
    await renderCast();
    await screen.findByRole("link", { name: "Cazril" });
    await userEvent.click(screen.getByRole("button", { name: "Add NPC" }));
    const dialog = await screen.findByRole("dialog", { name: "New NPC" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Create NPC" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Give them a name.");
    expect(server.calls.filter((call) => call.method === "POST")).toEqual([]);
  });
});
