import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  brannocId,
  installCharacterServer,
  noCharacters,
  noTables,
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
afterEach(() => document.body.replaceChildren());

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
    expect(within(brannoc as HTMLElement).getByText("Level 5 Half-orc Paladin")).toBeTruthy();
    // `campaignId` is the join key; the name comes from `GET /me/campaigns`.
    expect(within(brannoc as HTMLElement).getByText("The Salt Road")).toBeTruthy();
    expect(within(brannoc as HTMLElement).getByText("44 / 52")).toBeTruthy();

    const sorrel = (await screen.findByText("Sorrel Ash")).closest("div[data-slot=card]");
    expect(within(sorrel as HTMLElement).getByText("The Hag's Bargain")).toBeTruthy();
  });

  /**
   * `hpMax`, `ac` and `level` are all nullable, and a pill for each would be a
   * stubbed zero on the one screen whose whole job is to be true about a row.
   */
  it("omits a number the row does not have rather than showing a zero", async () => {
    await renderRoster();
    const sorrel = (await screen.findByText("Sorrel Ash")).closest("div[data-slot=card]");
    const pills = within(sorrel as HTMLElement);

    expect(pills.queryByText("HP")).toBeNull();
    expect(pills.queryByText("AC")).toBeNull();
    expect(pills.getByText("Level")).toBeTruthy();
  });

  it("opens a sheet through a real link, keyed on the character", async () => {
    await renderRoster();
    await screen.findByText("Brannoc Duskharrow");

    // The accessible role stays `button` on a `nativeButton={false}` anchor, so
    // this looks for a button and reads its href.
    const links = screen.getAllByRole("button", { name: "Open sheet" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/#/play/characters/${brannocId}`,
      `/#/play/characters/${sorrelId}`,
    ]);
  });

  it("offers nothing that writes", async () => {
    await renderRoster();
    await screen.findByText("Brannoc Duskharrow");

    // A player cannot write anything yet, so no control here may claim to.
    for (const name of [/New character/i, /Join a game/i, /Claim a seat/i, /Send to the DM/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("textbox")).toBeNull();
    // The live banner has no read behind it — the player projection of a fight
    // does not exist — so nothing here says a table is playing right now.
    expect(screen.queryByText(/playing right now/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Take your turn/i })).toBeNull();
  });

  it("tells the two empty rosters apart", async () => {
    server.routes = noCharacters();
    await renderRoster();

    await screen.findByText("No characters yet");
    expect(screen.getByText(/Your DM writes the characters/)).toBeTruthy();
    expect(screen.getByText("Ilse Vantar · no characters yet, at 2 tables.")).toBeTruthy();

    document.body.replaceChildren();
    server.routes = noTables();
    await renderRoster();

    await screen.findByText("No characters yet");
    expect(screen.getByText(/Nobody has invited you to a table/)).toBeTruthy();
    expect(screen.getByText("Ilse Vantar · not at a table yet.")).toBeTruthy();
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
});
