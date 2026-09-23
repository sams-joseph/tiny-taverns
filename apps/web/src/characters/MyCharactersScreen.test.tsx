import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  brannoc,
  brannocId,
  campaignId,
  installCharacterServer,
  noCharacters,
  noTables,
  onlyDmTables,
  ownedBrannoc,
  ownedSorrel,
  oneTable,
  otherCampaignId,
  partySeatAnswer,
  renderRoster,
  sorrelId,
} from "./characters.fixtures";

/**
 * The roster, against the two reads behind it.
 *
 * **Once per file, at module scope** — `FetchHttpClient.Fetch` is a
 * `Context.Reference` and a per-test `vi.stubGlobal` would keep serving the
 * first test's answers with nothing to notice.
 */
const server = installCharacterServer();

beforeEach(() => server.reset());
afterEach(() => {
  // RTL first, *then* the body: a dialog is portalled, so wiping the body under
  // a mounted tree makes React unmount into nothing and throw "the node to be
  // removed is not a child of this node" — reported against whichever test
  // happened to end with one open. `sheetWrites.test.tsx` records the same rule.
  cleanup();
  document.body.replaceChildren();
});

describe("your characters", () => {
  it("reads the three endpoints that have no campaign in their path", async () => {
    await renderRoster();
    await screen.findByText("Brannoc Duskharrow");

    const paths = server.calls.map((call) => call.pathname);
    expect(paths).toContain("/me/characters");
    expect(paths).toContain("/me/campaigns");
    // Who is reading, which the other two decline to say. It carries no
    // parameter and no search string, so there is nothing in the request that
    // could name an account but the credential's own.
    expect(paths).toContain("/me");
    const whoami = server.calls.find((call) => call.pathname === "/me");
    expect(whoami?.search).toBe("");
    expect(whoami?.body).toBe("");
    // One round of three, not a call per character: the campaign a row belongs
    // to is a name looked up here, never a second read per card.
    expect(server.calls).toHaveLength(3);
  });

  it("draws every character it was given, at the table it is at", async () => {
    await renderRoster();

    const brannoc = (await screen.findByText("Brannoc Duskharrow")).closest("div[data-slot=card]");
    expect(brannoc).not.toBeNull();
    const card = within(brannoc as HTMLElement);
    // The level is the portrait's badge, so the line under the name is the
    // lineage alone rather than the descriptor saying the level twice.
    expect(card.getByText("Level 5")).toBeTruthy();
    expect(card.getByText("Half-orc Paladin")).toBeTruthy();
    expect(card.queryByText("Level 5 Half-orc Paladin")).toBeNull();
    // `campaignId` is the join key; the name comes from `GET /me/campaigns`.
    expect(card.getByText("The Salt Road")).toBeTruthy();
    expect(card.getByText("Hit points")).toBeTruthy();
    expect(card.getByText("44 / 52")).toBeTruthy();
    // The bar fills to the same two numbers, and green above two thirds.
    const fill = (brannoc as HTMLElement).querySelector<HTMLElement>("[data-slot=hp-fill]");
    expect(fill?.style.width).toBe("85%");
    expect(fill?.className).toContain("bg-success");
    // The footer: the live condition set, and who plays them.
    expect(card.getByText("Blessed")).toBeTruthy();
    expect(card.getByText("Ilse")).toBeTruthy();

    const sorrel = (await screen.findByText("Sorrel Ash")).closest("div[data-slot=card]");
    expect(within(sorrel as HTMLElement).getByText("The Hag's Bargain")).toBeTruthy();
    expect(within(sorrel as HTMLElement).getByText("No conditions")).toBeTruthy();
  });

  /**
   * AC is the column; initiative is the sheet's own `+1`; passive Perception is
   * 10 plus the Wisdom modifier, because Brannoc's sheet has no Perception row.
   */
  it("draws AC, initiative and passive Perception in one box", async () => {
    await renderRoster();
    const brannoc = (await screen.findByText("Brannoc Duskharrow")).closest("div[data-slot=card]");
    const cells = [...(brannoc as HTMLElement).querySelectorAll("dl > div")].map((cell) => [
      cell.querySelector("dt")?.textContent,
      cell.querySelector("dd")?.textContent,
    ]);

    expect(cells).toEqual([
      ["AC", "18"],
      ["Init", "+1"],
      ["Passive", "11"],
    ]);
  });

  /**
   * `hpMax`, `ac` and `level` are all nullable, and a sheet nobody has written
   * has no ability cells, so every one of these can be missing — and a zero in
   * its place would be a stubbed value on the one screen whose whole job is to
   * be true about a row.
   */
  it("omits a number the row does not have rather than showing a zero", async () => {
    await renderRoster();
    const sorrel = (await screen.findByText("Sorrel Ash")).closest("div[data-slot=card]");
    const card = within(sorrel as HTMLElement);

    expect(card.getByText("Level 1")).toBeTruthy();
    expect(card.queryByText("Hit points")).toBeNull();
    expect((sorrel as HTMLElement).querySelector("[data-slot=hp-fill]")).toBeNull();
    // No AC, no DEX or WIS cell: nothing to put in the box, so no box.
    expect((sorrel as HTMLElement).querySelector("dl")).toBeNull();
    expect(card.queryByText("AC")).toBeNull();
    expect(card.queryByText("Init")).toBeNull();
    expect(card.queryByText("Passive")).toBeNull();
  });

  it("opens a sheet through the card's one link, keyed on the character", async () => {
    await renderRoster();
    await screen.findByText("Brannoc Duskharrow");

    // The whole card opens the sheet through the name's link; there is no
    // separate *Open sheet* control.
    expect(screen.queryByRole("button", { name: "Open sheet" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open sheet" })).toBeNull();
    const links = ["Brannoc Duskharrow", "Sorrel"].map((name) => {
      const card = screen.getByText(new RegExp(name)).closest("div[data-slot=card]");
      return within(card as HTMLElement).getByRole("link");
    });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/#/characters/${brannocId}`,
      `/#/characters/${sorrelId}`,
    ]);
  });

  it("offers create and the explicit seat write, without dead invitation controls", async () => {
    await renderRoster();
    await screen.findByText("Brannoc Duskharrow");

    // *New character* creates the top-level row. *Add to campaign* is the
    // later seat write, because creation no longer puts anything on a party.
    expect(screen.getByRole("button", { name: /New character/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Add to campaign/i })).toHaveLength(2);

    // The other three still have nothing behind them: there is no approval
    // queue and no column for one, no asset store, and following an invitation
    // is `#/join/<token>`, which reads it before anybody signs in.
    for (const name of [/Join a game/i, /Claim a seat/i, /Send to the DM/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    // Nothing is typed *here*. The form is a screen of its own, at a URL that
    // names the campaign context, because context is step one.
    expect(screen.queryByRole("textbox")).toBeNull();
    // The live banner belongs on the sheet, not the roster.
    expect(screen.queryByText(/playing right now/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Take your turn/i })).toBeNull();
  });

  it("seats an existing character with the explicit party join", async () => {
    server.routes.set(
      `POST /campaigns/${otherCampaignId}/party`,
      partySeatAnswer(brannoc, otherCampaignId),
    );

    await renderRoster();
    const card = (await screen.findByText("Brannoc Duskharrow")).closest("div[data-slot=card]");
    await userEvent.click(
      within(card as HTMLElement).getByRole("button", { name: /Add to campaign/i }),
    );

    const dialog = await screen.findByRole("dialog", { name: "Add to campaign" });
    // The button sits over the card's stretched link and must not also follow it.
    expect(window.location.hash).not.toContain(`/characters/${brannocId}`);
    expect(within(dialog).getByText(/The character stays yours/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Add to The Salt Road/i })).toBeNull();
    await userEvent.click(
      within(dialog).getByRole("button", { name: /Add to The Hag's Bargain/i }),
    );

    expect(bodyOf(server, "POST", `/campaigns/${otherCampaignId}/party`)).toEqual({
      characterId: brannocId,
    });
    expect(screen.queryByRole("dialog", { name: "Add to campaign" })).toBeNull();
    expect(server.calls.filter((call) => call.pathname === "/me/characters")).toHaveLength(2);
  });

  it("tells the two empty rosters apart, and a run table now counts", async () => {
    // A table to be at, and nothing on it yet — so the copy names the way out
    // and the control that is it is drawn.
    server.routes = noCharacters();
    await renderRoster();

    await screen.findByText("No characters yet");
    expect(screen.getByText(/Write one down using any table/)).toBeTruthy();
    expect(screen.getByText("Ilse Vantar · no characters yet, at 2 tables.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /New character/i })).toBeTruthy();

    cleanup();
    server.routes = noTables();
    await renderRoster();

    await screen.findByText("No characters yet");
    expect(screen.getByText(/Nobody has invited you to a table/)).toBeTruthy();
    expect(screen.getByText("Ilse Vantar · not at a table yet.")).toBeTruthy();
    // Nothing to write into, so nothing offering to. (A `Button` rendering an
    // `<a>` keeps the `button` role, so one query covers both shapes.)
    expect(screen.queryByRole("button", { name: /New character/i })).toBeNull();

    cleanup();
    // **The inversion the continuity decision made.** A membership at a table
    // this account *runs* used to be the third silence — a control deliberately
    // not drawn, because a character was campaign-scoped and DM-typed. A
    // creator is a player too now, so their own table offers the create flow
    // exactly as a played one does.
    server.routes = onlyDmTables();
    await renderRoster();

    await screen.findByText("No characters yet");
    expect(screen.getByText(/Write one down using any table/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /New character/i })).toBeTruthy();
  });

  /**
   * The picker is *step one of the flow*, and its whole job is to name a table
   * in the URL before the form exists — so what it is asserted on is where each
   * shape sends the reader, not how it looks.
   */
  it("picks the table before the form, and shapes itself to how many there are", async () => {
    // Two tables: a control, and a dialog naming both.
    await renderRoster();
    await screen.findByText("Brannoc Duskharrow");
    await userEvent.click(screen.getByRole("button", { name: /New character/i }));

    const dialog = await screen.findByRole("dialog");
    // A `Button` rendering an `<a>` keeps the accessible role `button`, so the
    // query is by button and the assertion is on the `href` — the rule
    // `CLAUDE.md` records for `nativeButton={false}`.
    const tables = within(dialog).getAllByRole("button", { name: /Salt Road|Hag's Bargain/ });
    expect(tables.map((link) => link.textContent)).toEqual(["The Salt Road", "The Hag's Bargain"]);
    // `/#/…` rather than `#/…` is what `createHashHistory` builds: the page's
    // own path, then the route behind the fragment.
    expect(tables.map((link) => link.getAttribute("href"))).toEqual([
      `/#/campaigns/${campaignId}/characters/new`,
      `/#/campaigns/${otherCampaignId}/characters/new`,
    ]);

    cleanup();
    // One table: no question to ask, so no dialog — the control *is* the link.
    server.routes = oneTable();
    await renderRoster();

    await screen.findByText("No characters yet");
    const straight = screen.getByRole("button", { name: /New character/i });
    expect(straight.getAttribute("href")).toBe(`/#/campaigns/${campaignId}/characters/new`);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says the server did not answer rather than an empty roster", async () => {
    server.transportDown = true;
    await renderRoster();

    await screen.findByText("The server did not answer");
    // "No characters" and "the API is down" are different sentences, and the
    // second must never be told as the first.
    expect(screen.queryByText("No characters yet")).toBeNull();
  });

  it("asks for a credential when there is none, and says where to get one", async () => {
    server.routes.set("GET /me/characters", {
      status: 401,
      body: { _tag: "Unauthorized", message: "no token" },
    });
    await renderRoster();

    expect(await screen.findByRole("alert")).toHaveTextContent("No credential yet");
    // A normal way to run this app, so it points at the machine token rather
    // than at a sign-in that may not exist here.
    expect(screen.getByText(/pnpm -F server token:issue/)).toBeTruthy();
  });

  it("says Hob is drawing, re-reads, and lays the portrait over the monogram", async () => {
    const drawn = {
      thumbUrl: "/portraits/p1/thumb?e=1&s=t",
      cardUrl: "/portraits/p1/card?e=1&s=c",
      fullUrl: "/portraits/p1/full?e=1&s=f",
    };
    const pending = {
      ...ownedBrannoc,
      character: { ...ownedBrannoc.character, portraitPending: true },
    };
    server.routes.set("GET /me/characters", { status: 200, body: [pending, ownedSorrel] });
    await renderRoster();
    expect(await screen.findByText("Hob is drawing…")).toBeTruthy();
    expect(document.querySelector("img[src*='/portraits/']")).toBeNull();

    const ready = {
      ...ownedBrannoc,
      character: { ...ownedBrannoc.character, portraitPending: false, portrait: drawn },
    };
    server.routes.set("GET /me/characters", { status: 200, body: [ready, ownedSorrel] });
    // The screen polls on its own; nothing here asks it to.
    await waitFor(
      () => expect(document.querySelector("img[src*='/portraits/p1/card']")).not.toBeNull(),
      { timeout: 5_000 },
    );
    expect(screen.queryByText("Hob is drawing…")).toBeNull();
    // Sorrel has no portrait: still the monogram, no image.
    expect(document.querySelectorAll("img[src*='/portraits/']")).toHaveLength(1);
  });
});
