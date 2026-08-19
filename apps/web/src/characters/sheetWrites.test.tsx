import type { CharacterOwnUpdate } from "@taverns/api";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  brannoc,
  brannocId,
  installCharacterServer,
  renderSheet,
  savedAs,
  sorrelId,
  strangerId,
} from "./characters.fixtures";

/**
 * The player's sheet *writing* — `PATCH /me/characters/:characterId`, which is
 * the first and still the only write in the product a non-DM may make.
 *
 * Four things each surface has to get right and each has a test here: the
 * payload that goes on the wire matches what was changed, the whole document
 * survives an edit to one key of it, a refusal reaches the screen rather than
 * eating what was typed, and **nothing the payload may not carry ever appears
 * on it**. The reads are `CharacterSheetScreen.test.tsx`; the fixtures are
 * shared with both.
 */

const server = installCharacterServer();

const patchPath = `/me/characters/${brannocId}`;

beforeEach(() => {
  server.reset();
  server.routes.set(`PATCH ${patchPath}`, savedAs(brannoc));
});
/**
 * **`cleanup()` first, then the sweep.** A dialog is portalled to the body, so
 * wiping the body before React has unmounted leaves it removing nodes that are
 * already gone — *"the node to be removed is not a child of this node"*, thrown
 * in teardown and reported against whichever test happened to end with a dialog
 * open. Half of these do, deliberately: a refused save is supposed to keep it.
 */
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

const tab = async (name: string) => {
  await userEvent.click(screen.getByRole("tab", { name }));
};

const sent = () => bodyOf(server, "PATCH", patchPath) as Record<string, unknown> | undefined;

/**
 * The five the payload has no field for.
 *
 * `CharacterOwnUpdate` cannot express any of them, so this is a backstop rather
 * than the boundary — but it is the backstop that would catch a hand-built
 * payload, and the boundary itself is asserted at compile time at the foot of
 * this file.
 */
const REFUSED = ["hpCurrent", "tempHp", "conditions", "visibility", "accountId"] as const;

const carriesNothingRefused = () => {
  const body = sent();
  expect(body).toBeDefined();
  for (const field of REFUSED) expect(body).not.toHaveProperty(field);
};

describe("editing the durable columns", () => {
  it("sends every column, with the one that changed changed", async () => {
    await renderSheet();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));

    const level = await screen.findByRole("spinbutton", { name: "Level" });
    await userEvent.clear(level);
    await userEvent.type(level, "6");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(sent()).toEqual({
        name: "Brannoc Duskharrow",
        playerName: "Ilse",
        level: 6,
        species: "Half-orc",
        className: "Paladin",
        ac: 18,
        hpMax: 52,
        sheetUrl: "https://example.invalid/brannoc",
      }),
    );
    // `descriptor` is a generated column and is on no payload — sending one is
    // refused by the schema before it reaches the network, and a locally
    // computed preview would be the second implementation it exists to prevent.
    expect(sent()).not.toHaveProperty("descriptor");
    // The document is not this form's, so a name change cannot carry a stale
    // copy of it over a backstory saved a moment ago.
    expect(sent()).not.toHaveProperty("sheet");
    carriesNothingRefused();
  });

  it("sends a cleared box as null rather than leaving the old value behind", async () => {
    await renderSheet();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));

    await userEvent.clear(await screen.findByRole("spinbutton", { name: "AC" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Sheet" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(sent()).toMatchObject({ ac: null, sheetUrl: null }));
  });

  it("re-reads the screen after a save, because the descriptor is derived", async () => {
    await renderSheet();
    const before = server.calls.filter((call) => call.pathname === "/me/characters").length;

    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Character" }), "!");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(server.calls.filter((call) => call.pathname === "/me/characters").length).toBe(
        before + 1,
      ),
    );
  });

  it("refuses a nameless character before anything is sent", async () => {
    await renderSheet();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));

    await userEvent.clear(await screen.findByRole("textbox", { name: "Character" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByText("Give them a name.")).toBeTruthy();
    expect(sent()).toBeUndefined();
  });

  /**
   * A failed save keeps the dialog and keeps the typing — the thing a form must
   * never do is close over an edit that never landed. `SaveFailure` is in the
   * footer rather than the end of the body for the reason `EncounterDialog`
   * records: the body scrolls.
   */
  it("says a refusal and keeps what was typed", async () => {
    server.routes.set(`PATCH ${patchPath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "character", id: brannocId },
    });

    await renderSheet();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));

    const species = await screen.findByRole("textbox", { name: "Species" });
    await userEvent.clear(species);
    await userEvent.type(species, "Goliath");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText(/belongs to someone else/);
    expect(screen.getByRole("textbox", { name: "Species" }).getAttribute("value")).toBe("Goliath");
  });
});

describe("editing the backstory", () => {
  it("sends the whole document with the prose replaced", async () => {
    await renderSheet();
    await screen.findByRole("tab", { name: /Story/ });
    await tab("Story");
    await userEvent.click(screen.getByRole("button", { name: "Edit backstory" }));

    const box = await screen.findByRole("textbox", { name: "Backstory" });
    await userEvent.clear(box);
    await userEvent.type(box, "He owes the ferryman a name.");
    await userEvent.click(screen.getByRole("button", { name: "Save backstory" }));

    await waitFor(() => expect(sent()).toBeDefined());
    const sheet = (sent() as { sheet: Record<string, unknown> }).sheet;
    expect(sheet["notes"]).toBe("He owes the ferryman a name.");
    // The half the form never drew, carried through rather than erased — the
    // whole reason a one-key edit sends the whole document.
    expect(sheet["abilities"]).toHaveLength(6);
    expect(sheet["spellcasting"]).toBeDefined();
    expect(sheet["inventory"]).toHaveLength(2);
    // The columns are not this form's to touch.
    expect(sent()).not.toHaveProperty("name");
    carriesNothingRefused();
  });

  it("offers the backstory on a sheet nobody has written yet", async () => {
    server.routes.set(`PATCH /me/characters/${sorrelId}`, savedAs(brannoc));
    await renderSheet(sorrelId);
    await screen.findByRole("tab", { name: /Story/ });
    await tab("Story");
    await userEvent.click(screen.getByRole("button", { name: "Edit backstory" }));

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Backstory" }),
      "Raised by the marsh.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save backstory" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/me/characters/${sorrelId}`)).toEqual({
        sheet: { notes: "Raised by the marsh.", abilities: [], traits: [] },
      }),
    );
  });
});

describe("adding gear", () => {
  const openGear = async () => {
    await screen.findByRole("tab", { name: /Gear/ });
    await tab("Gear");
    await userEvent.click(screen.getByRole("button", { name: /Add/ }));
  };

  it("appends a line and leaves the ones already carried alone", async () => {
    await renderSheet();
    await openGear();

    // The dialog opens with the lines already carried plus one blank one at the
    // end, which is what *Add* promises — so the row to fill is the last.
    const last = <T,>(nodes: ReadonlyArray<T>): T => nodes[nodes.length - 1] as T;
    await screen.findByRole("button", { name: "Save gear" });
    await userEvent.type(last(screen.getAllByRole("textbox", { name: "Item" })), "Coil of rope");
    await userEvent.type(last(screen.getAllByRole("spinbutton", { name: "How many" })), "1");
    await userEvent.type(last(screen.getAllByRole("textbox", { name: "Weight" })), "10 lb");
    await userEvent.click(screen.getByRole("button", { name: "Save gear" }));

    await waitFor(() => expect(sent()).toBeDefined());
    const sheet = (sent() as { sheet: { inventory: ReadonlyArray<unknown> } }).sheet;
    expect(sheet.inventory).toEqual([
      { name: "Halberd", quantity: 1, weight: "6 lb", equipped: true },
      { name: "Ferryman's token, unspent", quantity: 1, weight: "—", note: "From session 11" },
      { name: "Coil of rope", quantity: 1, weight: "10 lb" },
    ]);
    carriesNothingRefused();
  });

  it("drops the blank line somebody changed their mind about", async () => {
    await renderSheet();
    await openGear();
    await screen.findByRole("button", { name: "Save gear" });
    await userEvent.click(screen.getByRole("button", { name: "Save gear" }));

    await waitFor(() => expect(sent()).toBeDefined());
    expect(
      (sent() as { sheet: { inventory: ReadonlyArray<unknown> } }).sheet.inventory,
    ).toHaveLength(2);
  });

  /**
   * **The tab survives the save**, which it did not until the strip was
   * controlled from above the resource: a write re-reads, a re-read passes
   * through `loading`, and the subtree unmounts — so an uncontrolled strip
   * dropped the reader back on Stats with the line they had just added one
   * click away and invisible.
   */
  it("leaves the reader on the tab they saved from", async () => {
    await renderSheet();
    await openGear();
    await screen.findByRole("button", { name: "Save gear" });
    await userEvent.click(screen.getByRole("button", { name: "Save gear" }));

    await waitFor(() => expect(sent()).toBeDefined());
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Gear/ }).getAttribute("aria-selected")).toBe("true"),
    );
  });

  it("removes a line that is no longer carried", async () => {
    await renderSheet();
    await openGear();

    await userEvent.click(await screen.findByRole("button", { name: "Remove item 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Save gear" }));

    await waitFor(() => expect(sent()).toBeDefined());
    const inventory = (sent() as { sheet: { inventory: ReadonlyArray<{ name: string }> } }).sheet
      .inventory;
    expect(inventory.map((item) => item.name)).toEqual(["Ferryman's token, unspent"]);
  });
});

describe("marking a death save", () => {
  it("sends the mark and leaves the other row where it was", async () => {
    await renderSheet();
    await userEvent.click(await screen.findByRole("button", { name: "Failures 3" }));

    await waitFor(() => expect(sent()).toBeDefined());
    const sheet = (sent() as { sheet: Record<string, unknown> }).sheet;
    expect(sheet["deathSaves"]).toEqual({ successes: 1, failures: 3 });
    // One key of the document, so the rest of it goes with it untouched.
    expect(sheet["notes"]).toBe(brannoc.sheet.notes);
    carriesNothingRefused();
  });

  /**
   * Pressing the pip that is already the last filled one clears it — the kit's
   * own rule, and with three pips and no undo it is the only way back from a
   * mis-tap.
   */
  it("clears the last mark when it is pressed again", async () => {
    await renderSheet();
    await userEvent.click(await screen.findByRole("button", { name: "Successes 1" }));

    await waitFor(() => expect(sent()).toBeDefined());
    expect((sent() as { sheet: Record<string, unknown> }).sheet["deathSaves"]).toEqual({
      successes: 0,
      failures: 2,
    });
  });

  it("marks from nought on a character that has never gone down", async () => {
    server.routes.set(`PATCH /me/characters/${sorrelId}`, savedAs(brannoc));
    await renderSheet(sorrelId);
    await userEvent.click(await screen.findByRole("button", { name: "Failures 1" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/me/characters/${sorrelId}`)).toEqual({
        sheet: { notes: "", abilities: [], traits: [], deathSaves: { successes: 0, failures: 1 } },
      }),
    );
  });

  it("says so when the mark will not save", async () => {
    server.routes.set(`PATCH ${patchPath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "character", id: brannocId },
    });

    await renderSheet();
    await userEvent.click(await screen.findByRole("button", { name: "Failures 3" }));

    await screen.findByText(/belongs to someone else/);
    // And the mark is not drawn as though it landed.
    expect(screen.getByRole("button", { name: "Failures 3" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });
});

describe("what a player still cannot reach", () => {
  /**
   * **The boundary, asserted where it actually lives.** `CharacterOwnUpdate`
   * has no field for the live trio, the visibility toggle or the owner, so a
   * control for one of them does not compile — this fails the *build* if any of
   * the five is ever added to the payload, which is a stronger guarantee than
   * any assertion about a rendered screen.
   */
  it("cannot express the live half of the row, the visibility or the owner", () => {
    // One literal each, because an excess-property check reports the *first*
    // offending key and stops — five in one object would leave four of these
    // directives unused and the assertion three-quarters asleep.
    // @ts-expect-error `hpCurrent` moves by delta through the DM's own endpoint.
    const current: CharacterOwnUpdate = { hpCurrent: 12 };
    // @ts-expect-error `tempHp` is `0014`'s live trio and the DM's to say.
    const temp: CharacterOwnUpdate = { tempHp: 5 };
    // @ts-expect-error `conditions` writes through to every live combatant.
    const conditions: CharacterOwnUpdate = { conditions: ["Blessed"] };
    // @ts-expect-error the row's own half of the disclosure seam is the DM's.
    const visibility: CharacterOwnUpdate = { visibility: "shared" };
    // @ts-expect-error the owner of a row is the field a player must not send.
    const owner: CharacterOwnUpdate = { accountId: null };

    expect([current, temp, conditions, visibility, owner]).toHaveLength(5);
  });

  it("offers nothing to edit on a character that is not yours", async () => {
    await renderSheet(strangerId);
    await screen.findByText("Not here");

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Successes/ })).toBeNull();
    // And nothing was attempted against it: the read is the whole answer, so a
    // character that is not in it is not this account's.
    expect(server.calls.some((call) => call.method === "PATCH")).toBe(false);
  });
});
