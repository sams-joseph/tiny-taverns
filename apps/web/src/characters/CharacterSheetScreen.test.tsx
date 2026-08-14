import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  brannocId,
  installCharacterServer,
  renderSheet,
  sorrelId,
  strangerId,
} from "./characters.fixtures";

const server = installCharacterServer();

beforeEach(() => server.reset());
afterEach(() => document.body.replaceChildren());

const tab = async (name: string) => {
  await userEvent.click(screen.getByRole("tab", { name }));
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
   * Death saves live in the document by decision — no delivery of the runner
   * draws one, so a column would have no reader but the row that owns it. The
   * drawing's promise that they "show on your DM's initiative row straight
   * away" is not made here, because it is not true.
   */
  it("shows death saves as marks and offers no way to change them", async () => {
    await renderSheet();
    await screen.findByText("Death saves");

    expect(screen.getByText("1 of 3 successes")).toBeTruthy();
    expect(screen.getByText("2 of 3 failures")).toBeTruthy();
    const section = screen.getByText("Death saves").closest("div[data-slot=card]");
    expect(within(section as HTMLElement).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/initiative row/i)).toBeNull();
  });

  it("draws the tabs the document fills, and only those", async () => {
    await renderSheet();
    await screen.findByRole("tab", { name: /Stats/ });

    expect(screen.getAllByRole("tab").map((node) => node.textContent)).toEqual([
      "Stats",
      "Actions",
      "Gear",
      "Story",
      "Log",
    ]);
  });

  it("reads the document's own halves under each tab", async () => {
    await renderSheet();
    await screen.findByRole("tab", { name: /Stats/ });

    // Stats: the bestiary's `Ability`, grown a save and a proficiency mark.
    expect(screen.getByText("+4")).toBeTruthy();
    expect(screen.getByText("save +7")).toBeTruthy();
    expect(screen.getByText("Athletics")).toBeTruthy();
    expect(screen.getByText("All armour")).toBeTruthy();
    expect(screen.getByText("Lay on Hands")).toBeTruthy();

    await tab("Actions");
    expect(screen.getByText("Halberd")).toBeTruthy();
    expect(screen.getByText("1d10+4")).toBeTruthy();
    expect(screen.getByText("CHA · save 14 · atk +6")).toBeTruthy();
    // Slots are pips plus a sentence, because the pips are decoration.
    expect(screen.getByText("3 of 4 left")).toBeTruthy();
    expect(screen.getByText("Bless")).toBeTruthy();

    await tab("Gear");
    expect(screen.getByText("Ferryman's token, unspent")).toBeTruthy();
    expect(screen.getByText("From session 11")).toBeTruthy();
    expect(screen.getByText("gp")).toBeTruthy();
    expect(screen.getByText("84")).toBeTruthy();
    // An absent pile is absent, not a zero.
    expect(screen.queryByText("pp")).toBeNull();

    await tab("Story");
    expect(screen.getByText(/The temple on the salt road/)).toBeTruthy();
    expect(screen.getByText("Session 11")).toBeTruthy();
    expect(screen.getByText("A road is a promise between two towns.")).toBeTruthy();

    await tab("Log");
    expect(screen.getByText(/Took the oath at the ferry crossing/)).toBeTruthy();
  });

  /**
   * Read-only is the whole point of the step, so the assertion is about what is
   * *not* there: every affordance the drawing has writes, and a player cannot
   * write anything — `ownedRowWritable` deliberately does not exist.
   */
  it("offers no control that would fail", async () => {
    await renderSheet();
    await screen.findByRole("tab", { name: /Stats/ });

    const controls = () =>
      screen
        .queryAllByRole("button")
        .map((node) => node.textContent ?? "")
        .concat(screen.queryAllByRole("tab").map(() => ""));

    for (const label of ["Stats", "Actions", "Gear", "Story", "Log"]) {
      await tab(label);
      // The only pressable things on any tab are the tab strip itself and the
      // back link in the bar. Nothing rolls, spends, prepares, adds or edits.
      const pressable = controls().filter((text) => text !== "" && !text.includes("Characters"));
      expect(pressable).toEqual([]);
      expect(screen.queryByRole("textbox")).toBeNull();
    }

    // And the two the drawing puts in the bar beside the name.
    expect(screen.queryByRole("button", { name: /Go to the table/i })).toBeNull();
    expect(screen.queryByText(/playing right now/i)).toBeNull();
  });

  it("goes back to the roster through a real link", async () => {
    await renderSheet();
    await screen.findByRole("heading", { name: "Brannoc Duskharrow" });

    expect(screen.getByRole("button", { name: /Characters/ }).getAttribute("href")).toBe(
      "/#/play/characters",
    );
  });

  /**
   * The state every character `CharacterDialog` has ever written is in. The
   * numbers the columns hold still draw; the document says it is empty once,
   * rather than five tabs saying it five times.
   */
  it("says an empty sheet is empty, once", async () => {
    await renderSheet(sorrelId);
    await screen.findByRole("heading", { name: "Sorrel Ash" });

    expect(screen.getByText("Nothing written on the sheet yet")).toBeTruthy();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    // A character with no maximum has no bar and no invented pair.
    expect(screen.queryByText(/hp/)).toBeNull();
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
