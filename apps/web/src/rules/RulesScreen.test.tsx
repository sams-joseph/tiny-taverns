import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bloodswornOption,
  bloodswornOriginalId,
  campaignId,
  installRulesServer,
  marshfolkOption,
  renderRules,
  saltRunnerOption,
  saltRunnerOriginalId,
} from "./rules.fixtures";

/**
 * The Rules screen against a stub server.
 *
 * What is asserted is the four things about this screen that would be wrong
 * *silently* — each renders as a perfectly ordinary page when it is not right:
 *
 *   1. **which rows are a DM's to edit.** Ownership is `campaignId` /
 *      `accountId` and never `origin`, so a bundled class must draw no *Edit*
 *      and a copy must draw one. Read the other way round, a DM would press
 *      *Edit* on the bundle and get a 404 they cannot act on.
 *   2. **that writing one is two writes in one press** — the original into the
 *      Library and the copy into this table — because a screen that only did
 *      the first would look like it worked and leave the table without the
 *      class.
 *   3. **that the copy is sent `shared` out loud.** A class no player can pick
 *      is the friction the whole decision is about, and it is invisible from
 *      this screen: the DM sees the row either way and only the *player's*
 *      picker is short.
 *   4. **that the snapshot is said in words**, which is the likeliest support
 *      question this feature creates.
 */
const server = installRulesServer();

beforeEach(() => {
  server.reset();
});

const sent = (method: string, fragment: string) =>
  server.calls.find((call) => call.method === method && call.pathname.includes(fragment));

describe("what this table offers", () => {
  it("draws all three kinds, with the numbers a character is seeded from", async () => {
    await renderRules();

    // The campaign's own copy, and a bundled row beside it in the same list.
    expect(await screen.findByText("Bloodsworn")).toBeInTheDocument();
    expect(screen.getByText(/d10 · unarmoured 10 \+ DEX \+ CON/)).toBeInTheDocument();
    expect(screen.getByText("Druid")).toBeInTheDocument();
    expect(screen.getByText("Marshfolk")).toBeInTheDocument();
    expect(screen.getByText(/\+2 hit points per level/)).toBeInTheDocument();
    // Races now show their 2014 fixed bonuses and any hit-point rider.
    expect(screen.getAllByText(/\+2 CON.*\+2 hit points per level/).length).toBeGreaterThan(0);

    expect(screen.getByRole("region", { name: "Backgrounds" })).toBeInTheDocument();
    expect(screen.getByText("Salt-runner")).toBeInTheDocument();
    expect(screen.getByText(/Athletics/)).toBeInTheDocument();
    expect(screen.getByText("Soldier")).toBeInTheDocument();
    expect(screen.getAllByText("no fixed proficiencies").length).toBeGreaterThan(0);

    const feats = screen.getByRole("region", { name: "Feats" });
    expect(within(feats).getByText("Grappler")).toBeInTheDocument();
    expect(within(feats).getByText("Tavern Brawler")).toBeInTheDocument();
    expect(within(feats).getAllByText("STR 13").length).toBeGreaterThan(0);
  });

  it("counts what a DM can act on, and says how much of it a player cannot pick", async () => {
    await renderRules();
    // Thirteen classes, ten races and five backgrounds in the fixture, and
    // exactly one copy is unshared. The second clause is the whole friction of
    // the feature said where the DM will read it.
    expect(await screen.findByText(/13 classes, 10 races, 5 backgrounds/)).toBeInTheDocument();
    expect(screen.getByText(/1 your players cannot pick yet/)).toBeInTheDocument();
  });

  it("offers Edit on this table's own rows and on nothing else", async () => {
    await renderRules();
    await screen.findByText("Bloodsworn");

    // **Ownership, never `origin`.** A bundled row is unowned and nobody's to
    // edit; the two campaign copies are this DM's. Read off `origin` instead,
    // an *imported* copy would be wrongly locked and the whole list would be
    // one field away from the wrong answer.
    expect(screen.getByRole("button", { name: "Edit Bloodsworn" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Marshfolk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Salt-runner" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Druid" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Elf" })).toBeNull();
    // A bundled background is nobody's to edit either, and it is the one a DM
    // is likeliest to want to: all sixteen grant nothing, so *Edit* on one
    // would be exactly the 404 `isCampaignCopy` exists to prevent.
    expect(screen.queryByRole("button", { name: "Edit Soldier" })).toBeNull();
    // Three copies, three remove buttons, and none on the bundle.
    expect(screen.getAllByRole("button", { name: /Remove .* from this table/ })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Edit Grappler" })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Tavern Brawler" })).toBeInTheDocument();
  });

  it("opens the campaign copy's concrete progression", async () => {
    await renderRules();
    await userEvent.click(
      await screen.findByRole("button", { name: "Read Bloodsworn progression" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Bloodsworn progression" });
    expect(within(dialog).getByText("Star oath")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Subclass level 3")).toHaveLength(2);
    expect(within(dialog).getByText("Starlit vow")).toBeInTheDocument();

    await waitFor(() => {
      expect(sent("GET", `/options/${bloodswornOption.id}/progression`)).toBeDefined();
    });
  });

  it("says which rows no player can pick, and only about rows that can be shared", async () => {
    await renderRules();
    await screen.findByText("Marshfolk");

    expect(screen.getByText("Not shared")).toBeInTheDocument();
    expect(screen.getByText(/Nobody at this table can pick it until you share it/)).toBeVisible();
    // The bundle is written `shared` by the seeder, so there is exactly one.
    expect(screen.getAllByText("Not shared")).toHaveLength(1);
  });
});

describe("writing one", () => {
  it("authors the original and copies it into the table, in one press", async () => {
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: /Write a class/i }));

    const form = await screen.findByRole("dialog");
    await userEvent.type(within(form).getByLabelText("Name"), "Bloodsworn");
    await userEvent.clear(within(form).getByLabelText("Hit die"));
    await userEvent.type(within(form).getByLabelText("Hit die"), "10");
    // Unarmoured defence at 10 + DEX + CON, which is what the acceptance
    // scenario asks for and what a boolean could not express. Scoped to the
    // dialog because the cards behind it name the same three letters — the
    // formula is drawn on every class row.
    await userEvent.click(within(form).getByRole("checkbox", { name: "CON" }));

    await userEvent.click(within(form).getByRole("button", { name: /Add class/i }));

    await waitFor(() => {
      expect(sent("POST", "/library/options")).toBeDefined();
    });

    // **Two writes**, and the second is the one a screen that "worked" could
    // have skipped: the Library gets the original, and the campaign gets a copy
    // of it. Without the second, the DM would have written a class their table
    // does not offer.
    const authored = sent("POST", "/library/options");
    expect(JSON.parse(authored?.body ?? "{}")).toEqual({
      kind: "class",
      name: "Bloodsworn",
      body: { hitDie: 10, unarmouredAc: ["DEX", "CON"], proficiencies: [], savingThrows: [] },
    });

    const copied = sent("POST", `/options/${bloodswornOriginalId}/derive`);
    expect(copied).toBeDefined();
    // **`shared`, out loud.** The column default is `dm` and has not moved; this
    // is the visible screen-level choice, and it is the difference between a
    // class a player can pick and one nobody but the DM can see.
    expect(JSON.parse(copied?.body ?? "{}")).toEqual({ visibility: "shared" });
  });

  it("writes a background's 2014 proficiencies and equipment", async () => {
    // **The third kind.** 2014 ability score arithmetic belongs to race and
    // subrace; backgrounds carry the proficiencies, languages, equipment and
    // feature text that land on a new sheet.
    server.routes.set("POST /library/options", {
      status: 200,
      body: { ...saltRunnerOption, id: saltRunnerOriginalId, campaignId: null },
    });

    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: /Write a background/i }));

    const form = await screen.findByRole("dialog");
    await userEvent.type(within(form).getByLabelText("Name"), "Salt-runner");
    await userEvent.type(within(form).getByLabelText("Proficiencies"), "Athletics");
    await userEvent.type(within(form).getByLabelText("Equipment"), "ferryman's token");

    await userEvent.click(within(form).getByRole("button", { name: /Add background/i }));

    await waitFor(() => {
      expect(sent("POST", "/library/options")).toBeDefined();
    });

    expect(JSON.parse(sent("POST", "/library/options")?.body ?? "{}")).toEqual({
      kind: "background",
      name: "Salt-runner",
      body: {
        proficiencies: ["Athletics"],
        languages: [],
        equipment: ["ferryman's token"],
        choices: [],
      },
    });
    expect(
      JSON.parse(sent("POST", `/options/${saltRunnerOriginalId}/derive`)?.body ?? "{}"),
    ).toEqual({ visibility: "shared" });
  });

  it("draws one kind's fields and never another's", async () => {
    // The union as three thirds of one dialog. A background form that also drew
    // a hit die would let a DM type a number into a document that has nowhere
    // to keep it — and `repo/Options.ts`'s `bodyKind` tells the three apart by
    // exactly the key each has and the other two lack.
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: /Write a background/i }));

    const form = await screen.findByRole("dialog");
    expect(within(form).getByLabelText("Proficiencies")).toBeInTheDocument();
    expect(within(form).getByLabelText("Equipment")).toBeInTheDocument();
    expect(within(form).queryByLabelText("Hit die")).toBeNull();
    expect(within(form).queryByLabelText(/Hit points per level/)).toBeNull();
  });

  it("opens with the players able to see it, which is the one form in the product that does", async () => {
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: /Write a class/i }));

    const toggle = await screen.findByRole("switch", { name: /Players can see this/i });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByText(/Your players can pick this class when they make a character/),
    ).toBeVisible();

    // And it is a *switch*, not a changed default: a DM with a class they are
    // not ready to show turns it off and the row behaves like everything else.
    await userEvent.click(toggle);
    expect(screen.getByText(/No player can pick this class until you share it/)).toBeVisible();
  });

  it("says the copy is a snapshot, because nothing else will", async () => {
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: /Write a race/i }));

    expect(
      await screen.findByText(
        /copies it into this campaign.*snapshot.*will not change your library's original/s,
      ),
    ).toBeVisible();
    // A race form draws no hit die, and a class form draws no per-level hit
    // points — the union, as two halves of one dialog.
    expect(screen.getByLabelText(/Hit points per level/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Hit die")).toBeNull();
  });

  it("says what is wrong before it sends anything", async () => {
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: /Write a class/i }));
    await userEvent.click(await screen.findByRole("button", { name: /Add class/i }));

    expect(await screen.findByText("Give it a name.")).toBeVisible();
    expect(sent("POST", "/library/options")).toBeUndefined();
  });
});

describe("editing one", () => {
  it("edits this table's copy and says the original is untouched", async () => {
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Bloodsworn" }));

    expect(
      await screen.findByText(/You are editing this campaign's copy.*library's original/s),
    ).toBeVisible();
    // And the sentence a DM most needs: their players' existing characters do
    // not move. There is no recompute-all-sheets and there must not be one.
    expect(screen.getByText(/they keep the numbers they were made with/)).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => {
      expect(sent("PATCH", `/options/${bloodswornOption.id}`)).toBeDefined();
    });
    // The whole document, not a patch of one key — `OptionUpdate.body` is whole
    // for the reason `CreatureUpdate.statBlock` is.
    expect(JSON.parse(sent("PATCH", `/options/${bloodswornOption.id}`)?.body ?? "{}")).toEqual({
      name: "Bloodsworn",
      body: {
        hitDie: 10,
        unarmouredAc: ["DEX", "CON"],
        proficiencies: [],
        savingThrows: [],
        summary: "Sworn to the marsh.",
      },
      visibility: "shared",
    });
    // And nothing was written to the Library: an edit here is the copy's.
    expect(sent("PATCH", "/library/options")).toBeUndefined();
  });

  it("shares one that was not shared, which is the one press a player notices", async () => {
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: "Edit Marshfolk" }));

    const toggle = await screen.findByRole("switch", { name: /Players can see this/i });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() => {
      expect(sent("PATCH", `/options/${marshfolkOption.id}`)).toBeDefined();
    });
    expect(
      JSON.parse(sent("PATCH", `/options/${marshfolkOption.id}`)?.body ?? "{}").visibility,
    ).toBe("shared");
  });
});

describe("removing one", () => {
  it("names it, and says what does not happen", async () => {
    await renderRules();
    await userEvent.click(
      await screen.findByRole("button", { name: "Remove Bloodsworn from this table" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Remove Bloodsworn\?/)).toBeVisible();
    // The two things a DM will assume wrongly: that existing characters change,
    // and that their Library loses the class.
    expect(within(dialog).getByText(/keep the numbers they were made with/)).toBeVisible();
    expect(within(dialog).getByText(/original is not touched/)).toBeVisible();

    await userEvent.click(within(dialog).getByRole("button", { name: /Remove class/i }));
    await waitFor(() => {
      expect(sent("DELETE", `/options/${bloodswornOption.id}`)).toBeDefined();
    });
  });
});

describe("copying from the library", () => {
  it("offers what this account has written and never the bundle", async () => {
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: /Copy from your library/i }));

    const dialog = await screen.findByRole("dialog");
    // **The bundle is dropped**, and not as a filter over a leak: a bundled
    // option is already on every campaign's list, so copying one would make a
    // second Druid that shadows the first.
    expect(within(dialog).queryByText("Druid")).toBeNull();
    expect(within(dialog).queryByText("Soldier")).toBeNull();
    expect(within(dialog).getByText("Bloodsworn")).toBeVisible();
    expect(within(dialog).getByText("Marshfolk")).toBeVisible();
    expect(within(dialog).getByText("Salt-runner")).toBeVisible();
    // The original is still offered though a copy of it is already on the
    // table, because a copy is a separate row — and the row says so rather than
    // being hidden.
    expect(within(dialog).getAllByText(/already on this table/).length).toBe(3);
    expect(
      within(dialog).getByText(/Copying the same one again makes a second copy/),
    ).toBeVisible();
  });

  it("copies one in shared, and stays open", async () => {
    await renderRules();
    await userEvent.click(await screen.findByRole("button", { name: /Copy from your library/i }));

    const dialog = await screen.findByRole("dialog");
    // Named rather than taken by position: the Library is ordered by kind, so a
    // third kind silently moved whichever row `[0]` used to be — which is why
    // each button carries the row's own accessible name.
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy in Bloodsworn" }));

    await waitFor(() => {
      expect(sent("POST", `/options/${bloodswornOriginalId}/derive`)).toBeDefined();
    });
    expect(
      JSON.parse(sent("POST", `/options/${bloodswornOriginalId}/derive`)?.body ?? "{}"),
    ).toEqual({ visibility: "shared" });
    // Setting a table up is several classes, so the dialog does not close after
    // each one.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("what the screen does not do", () => {
  it("never offers to rewrite the characters already made from a class", async () => {
    // **There is no recompute-all-sheets and there must not be one.** It would
    // overwrite `ac` and `hpMax` values players typed by hand, with no way to
    // tell an intentional number from a stale seed. Asserted as an absence
    // because that is what it is.
    await renderRules();
    await screen.findByText("Bloodsworn");

    expect(screen.queryByRole("button", { name: /recompute/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /update.*characters/i })).toBeNull();
    expect(screen.queryByText(/characters will be updated/i)).toBeNull();
  });

  it("asks for the campaign's list and this account's library, and nothing else new", async () => {
    await renderRules();
    await screen.findByText("Bloodsworn");

    expect(sent("GET", `/campaigns/${campaignId}/options`)).toBeDefined();
    expect(sent("GET", "/library/options")).toBeDefined();
    // The creature Library is a different corpus with a different reader, so a
    // key shared between them would refresh a list nobody is looking at.
    expect(sent("GET", "/library/creatures")).toBeUndefined();
  });
});
