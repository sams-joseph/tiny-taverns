import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bloodswornOriginalId,
  campaignId,
  installRulesServer,
  marshfolkOriginalId,
  renderOptionLibrary,
} from "./rules.fixtures";

/**
 * The library of classes and species, against a stub server.
 *
 * What is asserted is the four things about this screen that would be wrong
 * *silently* — each renders as a perfectly ordinary page when it is not right:
 *
 *   1. **that it names no campaign, anywhere.** Authoring is not an act inside
 *      a campaign, and a screen that reached one would be reading a list that
 *      cannot contain what it is for. It is also the only client-side form the
 *      *originals only* rule can take: this list cannot show a campaign's copy
 *      because it never asks a campaign anything.
 *   2. **which rows are the reader's to edit.** Ownership is `accountId` and
 *      never `origin`, so a bundled class must draw no *Edit* and an original
 *      must draw one. Read the other way round, a DM would press *Edit* on the
 *      bundle and get a 404 they cannot act on.
 *   3. **that editing an original reaches no campaign.** The write goes to
 *      `/library/options/:id` and to nothing else, which is the snapshot — and
 *      it is invisible from here, because the campaign whose copy did not move
 *      is a different screen.
 *   4. **that the snapshot is said in words**, which is the likeliest support
 *      question the whole feature creates and is the one this screen is most
 *      able to cause: the original looks like the source of truth and is not.
 */
const server = installRulesServer();

beforeEach(() => {
  server.reset();
});

const sent = (method: string, fragment: string) =>
  server.calls.find((call) => call.method === method && call.pathname.includes(fragment));

describe("what your library holds", () => {
  it("draws all three kinds, with the numbers a character is seeded from", async () => {
    await renderOptionLibrary();

    // This account's own originals, and bundled rows beside them in the same
    // lists — which is the whole of what `libraryRowReadable` returns.
    expect(await screen.findByText("Bloodsworn")).toBeInTheDocument();
    expect(screen.getByText(/d10 · unarmoured 10 \+ DEX \+ CON/)).toBeInTheDocument();
    expect(screen.getByText("Druid")).toBeInTheDocument();
    expect(screen.getByText("Marshfolk")).toBeInTheDocument();
    expect(screen.getByText(/\+2 hit points per level/)).toBeInTheDocument();
    // The third kind, and the sentence every bundled one of them draws: the
    // bundle ships names and no grants, so this is the commonest thing this
    // screen says about a background.
    expect(screen.getByText("Salt-runner")).toBeInTheDocument();
    expect(screen.getAllByText("No ability score increases written down").length).toBe(4);
  });

  it("counts what is in here and how much of it is yours", async () => {
    await renderOptionLibrary();
    // Counted by kind rather than by subtraction, so the background's arrival
    // was a clause rather than a silently wrong species count.
    expect(
      await screen.findByText(/13 classes, 11 species, 5 backgrounds · 3 yours/),
    ).toBeInTheDocument();
  });

  /**
   * **The whole model, as one assertion about the wire.** The list is
   * originals-only because the predicate says so, and the only way a client can
   * be consistent with that is to ask nothing else — a screen that also read a
   * campaign's vocabulary would be one filter away from showing a copy.
   */
  it("names no campaign in anything it asks for", async () => {
    await renderOptionLibrary();
    await screen.findByText("Bloodsworn");

    expect(sent("GET", "/library/options")).toBeDefined();
    expect(server.calls.some((call) => call.pathname.includes("/campaigns/"))).toBe(false);
  });

  it("offers Edit on the rows this account wrote and on nothing else", async () => {
    await renderOptionLibrary();
    await screen.findByText("Bloodsworn");

    // **Ownership, never `origin`.** A bundled row is unowned and nobody's to
    // edit; the two originals are this account's.
    expect(screen.getByRole("button", { name: "Edit Bloodsworn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Marshfolk" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Druid" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Elf" })).toBeNull();
  });

  /**
   * A library original's `visibility` sits at its `dm` default because nothing
   * writes it, and it is not a fact about anybody: there is no campaign for it
   * to be hidden inside. Drawn here it would mark **every row a DM ever wrote**
   * as hidden from players who could never have seen it.
   */
  it("says nothing about who can see a row, because nobody is at this table", async () => {
    await renderOptionLibrary();
    await screen.findByText("Bloodsworn");

    expect(screen.queryByText("Not shared")).toBeNull();
    expect(screen.queryByText(/until you share it/)).toBeNull();
    // The one badge that does belong: a row nobody owns.
    expect(screen.getAllByText("Standard").length).toBeGreaterThan(0);
  });

  it("has no way to copy one into a campaign, because it names none", async () => {
    await renderOptionLibrary();
    await screen.findByText("Bloodsworn");

    // The copy is made from the table it is going to — `CopyOptionIn`, on a
    // campaign's Rules screen — which is the one place the destination is not
    // a guess.
    expect(screen.queryByRole("button", { name: /Copy/i })).toBeNull();
  });
});

describe("writing one", () => {
  it("authors into the library, with no campaign anywhere near it", async () => {
    await renderOptionLibrary();
    await userEvent.click(await screen.findByRole("button", { name: /Write a class/i }));

    const form = await screen.findByRole("dialog");
    await userEvent.type(within(form).getByLabelText("Name"), "Hexbound");
    await userEvent.clear(within(form).getByLabelText("Hit die"));
    await userEvent.type(within(form).getByLabelText("Hit die"), "10");
    await userEvent.click(within(form).getByRole("checkbox", { name: "CON" }));

    await userEvent.click(within(form).getByRole("button", { name: /Add to your library/i }));

    await waitFor(() => {
      expect(sent("POST", "/library/options")).toBeDefined();
    });
    expect(JSON.parse(sent("POST", "/library/options")?.body ?? "{}")).toEqual({
      kind: "class",
      name: "Hexbound",
      body: { hitDie: 10, unarmouredAc: ["DEX", "CON"] },
    });

    // **One write, not two.** The Rules screen's own *Write a class* authors
    // and then derives, because a DM standing at a table means both; here there
    // is no table to mean, so a `derive` would be a copy into a campaign
    // nobody chose.
    expect(server.calls.some((call) => call.pathname.includes("/derive"))).toBe(false);
    expect(server.calls.some((call) => call.pathname.includes(`/campaigns/${campaignId}`))).toBe(
      false,
    );
  });

  it("writes a background's increases as a list of what was actually said", async () => {
    await renderOptionLibrary();
    await userEvent.click(await screen.findByRole("button", { name: /Write a background/i }));

    const form = await screen.findByRole("dialog");
    await userEvent.type(within(form).getByLabelText("Name"), "Salt-runner");
    await userEvent.type(within(form).getByLabelText("STR increase"), "2");
    await userEvent.type(within(form).getByLabelText("CON increase"), "1");
    // Typed and then thought better of: `0` and blank are the same thing — an
    // ability this background does not touch — and neither becomes a row.
    await userEvent.type(within(form).getByLabelText("WIS increase"), "0");

    await userEvent.click(within(form).getByRole("button", { name: /Add to your library/i }));

    await waitFor(() => {
      expect(sent("POST", "/library/options")).toBeDefined();
    });
    expect(JSON.parse(sent("POST", "/library/options")?.body ?? "{}")).toEqual({
      kind: "background",
      name: "Salt-runner",
      // In `ABILITY_KEYS` order rather than typing order, and with no `+0` row.
      body: {
        abilityIncreases: [
          { ability: "STR", amount: 2 },
          { ability: "CON", amount: 1 },
        ],
      },
    });
    expect(server.calls.some((call) => call.pathname.includes("/campaigns/"))).toBe(false);
  });

  it("carries no visibility switch, because an original is in no campaign", async () => {
    await renderOptionLibrary();
    await userEvent.click(await screen.findByRole("button", { name: /Write a species/i }));

    await screen.findByRole("dialog");
    // `OptionLibraryCreate` has no field for it. A control here would reach
    // nothing, and would imply the row is hidden from somebody.
    expect(screen.queryByRole("switch", { name: /Players can see this/i })).toBeNull();
    // A species form draws no hit die, and a class form draws no per-level hit
    // points — the union, as two halves of one editor.
    expect(screen.getByLabelText(/Hit points per level/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Hit die")).toBeNull();
  });

  it("says what a campaign will get, before there is one", async () => {
    await renderOptionLibrary();
    await userEvent.click(await screen.findByRole("button", { name: /Write a class/i }));

    expect(
      await screen.findByText(/takes its own copy.*Editing here afterwards will not change/s),
    ).toBeVisible();
  });

  it("says what is wrong before it sends anything", async () => {
    await renderOptionLibrary();
    await userEvent.click(await screen.findByRole("button", { name: /Write a class/i }));
    await userEvent.click(await screen.findByRole("button", { name: /Add to your library/i }));

    expect(await screen.findByText("Give it a name.")).toBeVisible();
    expect(sent("POST", "/library/options")).toBeUndefined();
  });
});

describe("editing one", () => {
  it("edits the original and reaches no campaign at all", async () => {
    await renderOptionLibrary();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Bloodsworn" }));

    // The sentence this screen exists to say. A DM standing on the original
    // has the strongest reason to expect an edit to travel, and it does not.
    expect(
      await screen.findByText(
        /Campaigns that already have this class keep theirs exactly as it is/,
      ),
    ).toBeVisible();
    expect(screen.getByText(/keeps the numbers they were made with/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => {
      expect(sent("PATCH", `/library/options/${bloodswornOriginalId}`)).toBeDefined();
    });
    // The whole document, not a patch of one key — `OptionLibraryUpdate.body`
    // is whole for the reason `CreatureUpdate.statBlock` is. And no
    // `visibility`, which the payload has no field for.
    expect(
      JSON.parse(sent("PATCH", `/library/options/${bloodswornOriginalId}`)?.body ?? "{}"),
    ).toEqual({
      name: "Bloodsworn",
      body: { hitDie: 10, unarmouredAc: ["DEX", "CON"], summary: "Sworn to the marsh." },
    });
    // **The snapshot, as a fact about the wire**: nothing was written to any
    // campaign, so no campaign's copy could have moved.
    expect(server.calls.some((call) => call.pathname.includes("/campaigns/"))).toBe(false);
  });

  it("edits the half its own kind names, whichever button opened it", async () => {
    await renderOptionLibrary();
    // Opened from the Species section, so the row's own `kind` decides — the
    // union earning its place. A form that trusted the button would draw a hit
    // die over a species document.
    await userEvent.click(await screen.findByRole("button", { name: "Edit Marshfolk" }));

    const form = await screen.findByRole("dialog");
    expect(within(form).getByLabelText(/Hit points per level/)).toHaveValue(2);
    expect(within(form).queryByLabelText("Hit die")).toBeNull();
  });
});

describe("deleting one", () => {
  it("lives in the form, and says the copies stay", async () => {
    await renderOptionLibrary();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Marshfolk" }));

    const form = await screen.findByRole("dialog");
    // No second confirmation — a modal over a modal, which the design system
    // forbids. What is beside the button is the part that matters, and it is
    // the captain's decision of 2026-08-14 rendered rather than hidden.
    expect(
      within(form).getByText(/Copies already in your campaigns stay where they are/),
    ).toBeVisible();

    await userEvent.click(within(form).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(sent("DELETE", `/library/options/${marshfolkOriginalId}`)).toBeDefined();
    });
    expect(server.calls.some((call) => call.pathname.includes("/campaigns/"))).toBe(false);
  });

  it("offers no delete on a row that is not yours", async () => {
    await renderOptionLibrary();
    await screen.findByText("Bloodsworn");
    // There is no way in at all: the bundle draws no *Edit*, and delete is
    // inside the form the *Edit* opens.
    expect(screen.queryByRole("button", { name: "Edit Druid" })).toBeNull();
  });
});

describe("when the read fails", () => {
  it("says so and offers the way back, rather than drawing an empty library", async () => {
    server.routes.set("GET /library/options", {
      status: 401,
      body: { _tag: "Unauthorized" },
    });
    await renderOptionLibrary();

    // An empty list and a refused one are the two states this screen must not
    // confuse: one means *write something*, the other means *your credential
    // is not working*.
    expect(await screen.findByRole("button", { name: /Try again/i })).toBeInTheDocument();
    expect(screen.queryByText("No classes at all")).toBeNull();
  });

  it("names the importer when there is genuinely nothing", async () => {
    server.routes.set("GET /library/options", { status: 200, body: [] });
    await renderOptionLibrary();

    // Reachable only on a database where `ruleset:import` has never run, since
    // every account reads the bundle — so the sentence names the fix rather
    // than implying the reader has done something wrong.
    expect(await screen.findByText("No classes at all")).toBeInTheDocument();
    expect(screen.getByText("No species at all")).toBeInTheDocument();
    expect(screen.getByText("No backgrounds at all")).toBeInTheDocument();
    expect(screen.getAllByText("pnpm -F server ruleset:import").length).toBe(3);
  });
});
