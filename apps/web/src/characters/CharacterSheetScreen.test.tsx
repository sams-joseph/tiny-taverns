import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bodyOf,
  brannoc,
  brannocId,
  brannocSeatRef,
  installCharacterServer,
  legacySheet,
  ownedSorrel,
  renderSheet,
  savedAs,
  sorrelId,
  strangerId,
} from "./characters.fixtures";

/**
 * The player's sheet *reading* — the seventh delivery's continuous sheet against
 * the fixture document, and the controls it must and must not offer.
 *
 * There are no tabs to walk any more, so what these tests walk is the
 * **sections**: each is a heading in the document and an item in the spine,
 * and the spine lists exactly the drawn ones. jsdom computes no layout, so
 * nothing here can see the three columns, the sticky rail or the scroll-spy
 * moving — those are the browser pass — but it can see which sections exist,
 * which one is lit, and whether a save keeps the reader where they were.
 */

const server = installCharacterServer();

beforeEach(() => server.reset());
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const spine = () => screen.getByRole("navigation", { name: "Sheet sections" });
const spineItems = () =>
  within(spine())
    .getAllByRole("button")
    .map((node) => node.getAttribute("aria-label"));
const lit = () =>
  within(spine())
    .getAllByRole("button")
    .find((node) => node.getAttribute("aria-current") === "true")
    ?.getAttribute("aria-label");
const section = (name: string) => screen.getByRole("heading", { name });
/** One section's own box, so a word the fixture uses twice is found once. */
const inSection = (id: string) => {
  const box = document.getElementById(`sheet-${id}`);
  if (box === null) throw new Error(`no section #sheet-${id}`);
  return within(box);
};

describe("a character sheet", () => {
  it("draws the columns in the header and the identity card", async () => {
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });

    // `descriptor` is a generated column, drawn and never recomputed; the
    // subclass is the one identity field it cannot derive. **The campaign leads
    // the line since the sixth delivery**: this route names no campaign, so
    // there is no campaign row to hang it in and it joined the subtitle that
    // already says which character this is.
    expect(
      screen.getByText("The Salt Road · Level 5 Half-orc Paladin · Oath of the Open Road"),
    ).toBeTruthy();
    expect(screen.getByText("Temple foundling · Lawful neutral")).toBeTruthy();
    expect(screen.getByText("Played by Ilse")).toBeTruthy();
    expect(screen.getByText("/ 52 hp")).toBeTruthy();
    expect(screen.getByText("+3 temp")).toBeTruthy();
    expect(screen.getByText("Blessed")).toBeTruthy();
    expect(screen.getByText("Hit dice 3/5 d10")).toBeTruthy();
    expect(screen.getByText("6,500 / 14,000 xp")).toBeTruthy();
    // The one column that names somewhere else, rendered as a real link.
    expect(
      screen.getByRole("link", { name: "The sheet they keep elsewhere" }).getAttribute("href"),
    ).toBe("https://example.invalid/brannoc");
  });

  /**
   * The narrow layout's two-line summary — drawn from the same columns the
   * track and the pills read, so it cannot say a different number — and the
   * press that opens the rest of the card. jsdom cannot tell which layout is
   * showing, so what is asserted is the sentence and the toggle's state.
   */
  it("summarises the vitals on one line and expands them on a press", async () => {
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });

    expect(screen.getByText("44 / 52 hp · AC 18 · +1 init")).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /Show vitals/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Hide vitals/ }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  /**
   * Death saves live in the document by decision — no delivery of the runner
   * draws one, so a column would have no reader but the row that owns it. They
   * are pressable since the player write landed; what is still not true is the
   * drawing's promise that a mark *"shows on your DM's initiative row straight
   * away"*, so the copy beside them says what actually happens instead.
   */
  it("draws death saves as marks a player can press, and does not promise the DM sees them", async () => {
    await renderSheet();
    await screen.findByText("Death saves");

    expect(screen.getByText("1 of 3 successes")).toBeTruthy();
    expect(screen.getByText("2 of 3 failures")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Successes 1" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Successes 2" }).getAttribute("aria-pressed")).toBe(
      "false",
    );

    expect(screen.queryByText(/initiative row/i)).toBeNull();
    expect(screen.getByText(/does not show these yet/)).toBeTruthy();
  });

  /**
   * **The spine lists exactly the drawn sections, in the delivery's order**, and
   * every one of them is a heading in the document. The full fixture fills all
   * seven; the section rule is `sheet.test.ts`'s, and this is that rule reaching
   * the screen.
   */
  it("draws the sections the document fills, and a spine that lists exactly those", async () => {
    await renderSheet();
    await screen.findByRole("navigation", { name: "Sheet sections" });

    const all = [
      "Abilities & skills",
      "Actions",
      "Spellcasting",
      "Features & traits",
      "Gear & coin",
      "Story",
      "Level ups",
    ];
    expect(spineItems()).toEqual(all);
    for (const name of all) expect(section(name)).toBeTruthy();
    // Each section is an anchor target the spine (or a link) can land on.
    expect(document.getElementById("sheet-gear")).not.toBeNull();
    // The first section is lit until the reader scrolls.
    expect(lit()).toBe("Abilities & skills");
  });

  it("lights the section a spine press asks for", async () => {
    await renderSheet();
    await screen.findByRole("navigation", { name: "Sheet sections" });

    await userEvent.click(within(spine()).getByRole("button", { name: "Gear & coin" }));
    expect(lit()).toBe("Gear & coin");
    await userEvent.click(within(spine()).getByRole("button", { name: "Story" }));
    expect(lit()).toBe("Story");
  });

  it("reads the document's own halves in one continuous column", async () => {
    await renderSheet();
    await screen.findByRole("navigation", { name: "Sheet sections" });

    // Abilities & skills: the bestiary's `Ability`, grown a save and a
    // proficiency mark; the skills; the proficiency badges.
    expect(screen.getByText("+4")).toBeTruthy();
    expect(screen.getByText("save +7")).toBeTruthy();
    expect(screen.getByText("Athletics")).toBeTruthy();
    expect(screen.getByText("All armour")).toBeTruthy();

    // Actions: read off `actions` — the attack and damage rolls are local-only,
    // and **its cost as a badge and nothing ticked** (D6). (The fixture carries
    // a halberd on the gear too, so the word is on the sheet twice now that
    // every section is on screen at once.)
    expect(inSection("actions").getByText("Halberd")).toBeTruthy();
    expect(
      inSection("actions").getByRole("button", { name: "Roll Halberd dice 1d10+4" }),
    ).toBeTruthy();
    expect(inSection("actions").getAllByText("1 action")).toHaveLength(2);
    expect(
      inSection("actions").getByText(/Heavy · Two-Handed · Attack ×2 · Slashing · Reach 10 ft\./),
    ).toBeTruthy();
    // A feature with a roll and no cost draws a roll button and no badge.
    expect(
      inSection("actions").getByRole("button", { name: "Roll Divine Smite dice 2d8" }),
    ).toBeTruthy();
    expect(inSection("actions").getByText(/expend a spell slot/)).toBeTruthy();

    // Spellcasting: the header aside, the slots as pips plus a sentence
    // (because the pips are decoration) — off the `slot:N` resources — and
    // the known list.
    expect(screen.getByText("CHA · save 14 · atk +6")).toBeTruthy();
    expect(screen.getByText("3 of 4 left")).toBeTruthy();
    expect(screen.getByText("2 of 2 left")).toBeTruthy();
    expect(screen.getByText("Bless")).toBeTruthy();

    // Features & traits, their own section on the continuous sheet — and a
    // feature with a counter on `resources` wears it as text, read-only.
    expect(inSection("features").getByText("Lay on Hands")).toBeTruthy();
    expect(inSection("features").getByText("15/25 hp · long rest")).toBeTruthy();

    // Gear & coin: the list and the purse. An absent pile is absent, not a zero.
    expect(inSection("gear").getByText("Halberd")).toBeTruthy();
    expect(screen.getByText("Ferryman's token, unspent")).toBeTruthy();
    expect(screen.getByText("From session 11")).toBeTruthy();
    expect(screen.getByText("gp")).toBeTruthy();
    expect(screen.getByText("84")).toBeTruthy();
    expect(screen.queryByText("pp")).toBeNull();

    // Story: the backstory, the journal under it, the aside beside it.
    expect(screen.getByText(/The temple on the salt road/)).toBeTruthy();
    expect(screen.getByText("Session 11")).toBeTruthy();
    expect(screen.getByText("A road is a promise between two towns.")).toBeTruthy();

    // Level ups.
    expect(screen.getByText(/Took the oath at the ferry crossing/)).toBeTruthy();
  });

  /**
   * **The writes are exactly the payload's, so the assertion is about what is
   * still not there.** `CharacterOwnUpdate` names the durable columns and the
   * document; everything the drawing offers beyond that either has no endpoint
   * at all (rolling into the DM's dice tray) or is somebody else's to say
   * (`0014`'s live trio). The seventh delivery draws more of those than the
   * fourth did — dice on every attack and ability, spell pips that spend, a
   * prepared toggle, a portrait upload, a roll log — and none of them is here,
   * which is the rule that decided which affordances landed and has not moved.
   */
  /**
   * A row written before the corpus wrote the sheet holds `attacks` and
   * `spellcasting.slots` and neither new key. It draws exactly as it did: the
   * Actions section off the `Trait`s (no cost, because a `Trait` never carried
   * one) and the pips off the legacy slots.
   */
  it("still draws a sheet that holds only the legacy attacks and slots", async () => {
    server.routes.set("GET /me/characters", {
      status: 200,
      body: [
        { character: { ...brannoc, sheet: legacySheet }, seats: [brannocSeatRef] },
        ownedSorrel,
      ],
    });
    await renderSheet();
    await screen.findByRole("navigation", { name: "Sheet sections" });

    expect(inSection("actions").getByText("Halberd")).toBeTruthy();
    expect(inSection("actions").getByText("1d10+4")).toBeTruthy();
    expect(inSection("actions").getByText(/Reach 10 ft\./)).toBeTruthy();
    expect(inSection("actions").queryByText("1 action")).toBeNull();
    expect(screen.getByText("3 of 4 left")).toBeTruthy();
    // No counter on `resources`, so the feature wears no note it did not carry.
    expect(inSection("features").queryByText(/long rest/)).toBeNull();
  });

  it("offers no control the payload cannot carry", async () => {
    await renderSheet();
    await screen.findByRole("navigation", { name: "Sheet sections" });

    const pressable = () =>
      screen
        .queryAllByRole("button")
        .map((node) => node.getAttribute("aria-label") ?? node.textContent ?? "")
        .filter(
          (text) =>
            text !== "" &&
            !text.includes("Characters") &&
            // The spine is navigation, not a write; the seven are counted
            // above and are not what this test is about.
            !spineItems().includes(text),
        );

    // *Ask Hob* is the shell's own chrome on every campaign-less screen — the
    // bar the designers drew, with no handler here — not a sheet control. The
    // vitals toggle opens the narrow summary and writes nothing. Everything
    // else is a write the payload carries: the bar's *Edit* and *Delete*, the
    // resource spend/rest controls, the five section actions, and the six
    // death-save pips.
    expect(pressable()).toEqual([
      "Ask Hob⌘K",
      "Delete Brannoc Duskharrow",
      "Edit",
      "Show vitals",
      "−",
      "+",
      "Short rest",
      "Long rest",
      "Successes 1",
      "Successes 2",
      "Successes 3",
      "Failures 1",
      "Failures 2",
      "Failures 3",
      "Normal",
      "Adv",
      "Dis",
      "Edit abilities",
      "Edit skills",
      "Roll STR check",
      "Roll DEX check",
      "Roll CON check",
      "Roll INT check",
      "Roll WIS check",
      "Roll CHA check",
      "Roll Halberd attack +7",
      "Roll Halberd dice 1d10+4",
      "Roll Divine Smite dice 2d8",
      "Edit spells",
      "Recover level 1 spell slot 1",
      "Spend level 1 spell slot 2",
      "Spend level 1 spell slot 3",
      "Spend level 1 spell slot 4",
      "Spend level 2 spell slot 1",
      "Spend level 2 spell slot 2",
      "Recover",
      "Spend",
      "Add",
      "Edit backstory",
    ]);

    // The cell and attack row roll locally.
    expect(screen.getByRole("button", { name: "Roll STR check" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Roll Halberd dice 1d10+4" })).toBeTruthy();
    // Rolls and slots can be pressed now; preparing spells is a picker action,
    // not an inline toggle on the sheet.
    expect(screen.getAllByRole("button", { name: /spell slot/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Prepare/i })).toBeNull();
    // No portrait upload and no journal entry. The roll log is present, and its
    // copy says the result stays local.
    expect(screen.queryByRole("button", { name: /portrait/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Entry/ })).toBeNull();
    expect(screen.getByText(/Your rolls/)).toBeTruthy();
    expect(screen.getByText(/not sent to the DM or table yet/i)).toBeTruthy();

    // The live half of the row is drawn and is nobody's to change here.
    expect(screen.queryByRole("button", { name: /temp/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Blessed/ })).toBeNull();

    // And the two the drawing puts at the top: absent here because **nothing is
    // running**, which is the fixture's default and the common case. They have a
    // read behind them now — see `liveBanner.test.tsx`, which drives the state
    // where they appear — so this is the quiet half of that pair rather than a
    // feature that does not exist. The drawing's permanent campaign badge in
    // the bar is not drawn either; the campaign is on the subtitle.
    expect(screen.queryByRole("button", { name: /Go to the table/i })).toBeNull();
    expect(screen.queryByText(/playing right now/i)).toBeNull();
  });

  it("rolls abilities and actions into a local, truthful log", async () => {
    await renderSheet();
    await screen.findByRole("navigation", { name: "Sheet sections" });
    const before = server.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Adv" }));
    await userEvent.click(screen.getByRole("button", { name: "Roll STR check" }));
    const log = () => within(screen.getByRole("list", { name: "Your rolls log" }));
    expect(log().getByText("STR check")).toBeTruthy();
    expect(log().getByText(/1d20\+4 · dice \d+, \d+ · kept \d+ · \+4 · advantage/)).toBeTruthy();
    expect(
      screen.getByText(/Kept on this sheet only\. Rolls are not sent to the DM or table yet\./),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Roll Halberd dice 1d10+4" }));
    expect(log().getByText("Halberd")).toBeTruthy();
    expect(log().getByText(/1d10\+4 · dice \d+ · \+4 · normal/)).toBeTruthy();
    expect(server.calls).toHaveLength(before);
  });

  it("preserves non-rollable actions as read-only", async () => {
    await renderSheet();
    await screen.findByRole("navigation", { name: "Sheet sections" });

    expect(inSection("actions").getByText("Lay on Hands")).toBeTruthy();
    expect(inSection("actions").queryByRole("button", { name: /Lay on Hands/ })).toBeNull();
  });

  it("spends a slot and rests through the owner-only resource endpoints", async () => {
    server.routes.set(`POST /me/characters/${brannocId}/spend`, savedAs(brannoc));
    server.routes.set(`POST /me/characters/${brannocId}/rest`, savedAs(brannoc));
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });

    await userEvent.click(screen.getByRole("button", { name: "Spend level 1 spell slot 2" }));
    await waitFor(() =>
      expect(bodyOf(server, "POST", `/me/characters/${brannocId}/spend`)).toMatchObject({
        resourceId: "slot:1",
        amount: 1,
        requestId: expect.any(String),
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "+" }));
    await userEvent.click(screen.getByRole("button", { name: "Short rest" }));
    await waitFor(() =>
      expect(bodyOf(server, "POST", `/me/characters/${brannocId}/rest`)).toMatchObject({
        kind: "short",
        hitDice: 1,
        requestId: expect.any(String),
      }),
    );
  });

  it("goes back to the roster through a real link", async () => {
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });

    expect(screen.getByRole("button", { name: /Characters/ }).getAttribute("href")).toBe(
      "/#/characters",
    );
  });

  /**
   * The state every character `CharacterDialog` has ever written is in — and
   * the one the read-only screen used to answer with *"nothing written on the
   * sheet yet"*, full stop.
   *
   * That sentence is the wrong answer now: a player can write, so the empty
   * sheet has to be the place they start rather than a notice about somebody
   * else. Abilities & skills, Gear & coin and Story are drawn on an empty
   * document for exactly that reason — each carries the affordance that creates
   * its own contents. Actions, Spellcasting, Features and Level ups are not,
   * because nothing on this screen writes an attack, a spell slot, a feature or
   * a level-up — and the spine lists only the three.
   */
  it("gives an unwritten sheet somewhere to start, and no section it cannot fill", async () => {
    await renderSheet(sorrelId);
    await screen.findByRole("heading", { name: "Sorrel Ash" });

    expect(spineItems()).toEqual(["Abilities & skills", "Gear & coin", "Story"]);
    expect(screen.queryByRole("heading", { name: "Actions" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Spellcasting" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Features & traits" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Level ups" })).toBeNull();

    // The six cells are where a score is typed a first time, so the section is
    // there with a sentence rather than a grid of nothing.
    expect(screen.getByRole("button", { name: "Edit abilities" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit skills" })).toBeTruthy();
    expect(screen.getByText(/Take the standard array, or roll for them/)).toBeTruthy();
    expect(screen.getByText(/What you are proficient in/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add/ })).toBeTruthy();
    expect(screen.getByText(/A rope, a lantern/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit backstory" })).toBeTruthy();
    expect(screen.getByText(/Where they came from/)).toBeTruthy();
    // And nothing is drawn as a value that is not one: no cell with an empty
    // modifier under it, no `undefined` where a bonus would be.
    expect(screen.queryByText("undefined")).toBeNull();
    expect(screen.queryByText("NaN")).toBeNull();

    // A character with no maximum has no bar, no pills and no invented pair —
    // and no summary line, because there is nothing to summarise.
    expect(screen.queryByText(/hp/)).toBeNull();
    expect(screen.queryByText(/AC /)).toBeNull();
    // And death saves are markable from nought, which is where they start.
    expect(screen.getByText("0 of 3 successes")).toBeTruthy();
  });

  /**
   * **Keeping your place across a write.** A save re-reads the screen, and the
   * tabbed sheet used to lose the open tab to that re-read. The continuous sheet
   * must not lose the lit section or the document under it: the atom holds the
   * last value through the refresh, so the section nodes stay the same nodes,
   * and the lit section is screen state above the resource. Measured in jsdom
   * as node identity, and in Chromium as `scrollTop` — see the screen's doc.
   */
  it("keeps the reader on the section they saved from", async () => {
    server.routes.set(`PATCH /me/characters/${brannocId}`, savedAs(brannoc));
    await renderSheet();
    await screen.findByRole("navigation", { name: "Sheet sections" });

    await userEvent.click(within(spine()).getByRole("button", { name: "Gear & coin" }));
    const gearBefore = document.getElementById("sheet-gear");
    const reads = () => server.calls.filter((call) => call.pathname === "/me/characters").length;
    const before = reads();

    await userEvent.click(screen.getByRole("button", { name: /Add/ }));
    await screen.findByRole("button", { name: "Save gear" });
    await userEvent.click(screen.getByRole("button", { name: "Save gear" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/me/characters/${brannocId}`)).toBeDefined(),
    );
    // The write re-read the sheet…
    await waitFor(() => expect(reads()).toBe(before + 1));
    // …and the reader is still looking at Gear, in the same document.
    expect(lit()).toBe("Gear & coin");
    expect(document.getElementById("sheet-gear")).toBe(gearBefore);
    expect(screen.queryByText("Reading the sheet…")).toBeNull();
  });

  /**
   * `GET /me/characters` is `ownRowReadable` — ownership *conjoined* with the
   * read predicate — so a character that is not in the answer is not this
   * account's, and the honest thing to say is what the server says about
   * everything it will not show.
   */
  it("says not here for a character that is not yours", async () => {
    await renderSheet(strangerId);
    await screen.findByText("Not here");
    expect(screen.getByText(/belongs to someone else/)).toBeTruthy();
  });

  it("names the campaign on the sheet's own line, from the membership list", async () => {
    // It used to hang in the top nav. This route names no campaign — `GET
    // /me/characters` is the one read on `character` with none in its path — so
    // the sixth delivery's campaign row is correctly absent here, and the name
    // moved to the line that identifies the character rather than being lost.
    await renderSheet(brannocId);
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });
    expect(screen.getByText(/^The Salt Road · /)).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "This campaign" })).toBeNull();
  });

  it("says the server did not answer rather than not here", async () => {
    server.transportDown = true;
    await renderSheet();

    await screen.findByText("The server did not answer");
    expect(screen.queryByText("Not here")).toBeNull();
  });
});
