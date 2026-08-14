import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaignId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
} from "../campaign/campaign.fixtures";
import {
  bandit,
  bothMemberships,
  goblin,
  hag,
  otherCampaignId,
  owlbear,
  renderLibrary,
  sexton,
} from "./bestiary.fixtures";

/**
 * The Library, against a stubbed wire decoded by the real client.
 *
 * The campaign bestiary's own tests pin the reading behaviour the two screens
 * share, and they share it as code (`corpus.ts`, `CorpusParts.tsx`) rather than
 * by coincidence. What is asserted here is what only this screen has, and it is
 * the captain's model statement by statement:
 *
 *  - **it names no campaign**, in the URL or in the request;
 *  - **it authors** — create, edit and delete a Library original, and the
 *    *Edit* is offered on the rows this account owns and on no others;
 *  - **it copies into a campaign**, naming which, and says what a copy is;
 *  - **it adds no filter of its own**, because which rows are originals is
 *    settled by the predicate and a client-side answer could disagree with it.
 */

const server = installStubServer();
installMemoryStorage();

const LIST = "GET /library/creatures";

/** What the endpoint answers: this account's two originals, and the bundled two. */
const wholeLibrary = () => {
  server.routes.set(LIST, { status: 200, body: [owlbear, sexton, goblin, hag] });
  server.routes.set("GET /me/campaigns", { status: 200, body: bothMemberships });
};

beforeEach(() => {
  server.reset();
  wholeLibrary();
  window.localStorage.clear();
});

const libraryCalls = () => server.calls.filter((call) => call.pathname === "/library/creatures");

/** The querystring of the last Library read the screen asked for. */
const lastQuery = (): URLSearchParams =>
  new URLSearchParams(libraryCalls()[libraryCalls().length - 1]?.search ?? "");

const cardFor = (name: string): HTMLElement =>
  screen.getByText(name).closest("[data-slot='card']") as HTMLElement;

/** Fills the five boxes the contract requires, leaving the document empty. */
const fillRequired = async (name: string) => {
  await userEvent.type(screen.getByLabelText("Name"), name);
  await userEvent.type(screen.getByLabelText("Type"), "Monstrosity");
  await userEvent.type(screen.getByLabelText("CR"), "3");
  await userEvent.type(screen.getByLabelText("AC"), "14");
  await userEvent.type(screen.getByLabelText("Hit points"), "59");
};

describe("LibraryScreen", () => {
  it("shows the bundle beside what this account authored", async () => {
    await renderLibrary(mintingSession());

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();

    for (const name of ["Bog Owlbear", "Barrow Sexton", "Goblin Boss", "Marsh Hag"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText("4 creatures — yours, and the bundled corpus")).toBeInTheDocument();

    // Still the *row* form on the card — the integers that filter and sort.
    const card = within(cardFor("Bog Owlbear"));
    expect(card.getByText("CR 3")).toBeInTheDocument();
    expect(card.getByText("AC 14")).toBeInTheDocument();
    expect(card.getByText("59 hp")).toBeInTheDocument();
  });

  it("names no campaign in the request, which is the shape of the read", async () => {
    await renderLibrary(mintingSession());
    await screen.findByText("Bog Owlbear");

    expect(libraryCalls()).toHaveLength(1);
    // `libraryRowReadable` composes no campaign gate at all — uniquely in this
    // product — because a Library entity is in no campaign. There is nothing
    // here for a caller to claim and nothing for a path to carry.
    expect(libraryCalls()[0]?.pathname).toBe("/library/creatures");
    expect(server.calls.some((call) => call.pathname.includes("/creatures/"))).toBe(false);
  });

  it("adds no filter of its own — which rows are originals is the predicate's answer", async () => {
    // A campaign copy handed to this screen is *rendered*, deliberately. The
    // endpoint is anchored on `campaign_id is null` and cannot return one; a
    // client-side "originals only" on top would be a second answer to a settled
    // question, and the one that could disagree. Same rule `GET /me/characters`
    // states for its own narrowing.
    server.routes.set(LIST, { status: 200, body: [owlbear, bandit] });
    await renderLibrary(mintingSession());

    expect(await screen.findByText("Saltmarsh Bandit")).toBeInTheDocument();
    // …and it is still not editable here, because ownership is read off the row.
    expect(within(cardFor("Saltmarsh Bandit")).queryByRole("button", { name: /Edit/ })).toBeNull();
  });

  it("offers Edit on the rows this account owns and on no others", async () => {
    await renderLibrary(mintingSession());
    await screen.findByText("Bog Owlbear");

    // `accountId` is the ownership fact and the only non-null value a reader
    // ever sees is its own, so a row carrying one is theirs to write.
    expect(
      within(cardFor("Bog Owlbear")).getByRole("button", { name: "Edit Bog Owlbear" }),
    ).toBeInTheDocument();
    // The bundle is readable and not writable — `libraryRowWritable` is the read
    // predicate with the bundle's disjunct removed.
    expect(within(cardFor("Goblin Boss")).queryByRole("button", { name: /Edit/ })).toBeNull();

    expect(screen.getAllByText("Shared corpus")).toHaveLength(2);
    expect(within(cardFor("Bog Owlbear")).queryByText("Shared corpus")).toBeNull();
  });

  it("keeps 'imported' and 'yours' from being the same question", async () => {
    await renderLibrary(mintingSession());
    await screen.findByText("Barrow Sexton");

    // Provenance says where content came from; `accountId` says who may write
    // it. An imported Library entity is both `Imported` and editable.
    const card = within(cardFor("Barrow Sexton"));
    expect(card.getByText("Imported")).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Edit Barrow Sexton" })).toBeInTheDocument();
  });

  it("sends the search to the server rather than filtering what it already has", async () => {
    await renderLibrary(mintingSession());
    await screen.findByText("Bog Owlbear");

    server.routes.set(LIST, { status: 200, body: [goblin] });
    await userEvent.type(screen.getByRole("textbox", { name: "Search the library" }), "nimble");

    // Same reason as the campaign bestiary: "nimble escape" is a trait, in no
    // column. `LibraryFilter` is spread into `CreatureFilter` precisely so the
    // two boxes cannot come to mean different things.
    await waitFor(() => expect(lastQuery().get("q")).toBe("nimble"));
    await waitFor(() => expect(screen.queryByText("Bog Owlbear")).toBeNull());
    expect(screen.getByText("1 creature matches what you're looking for")).toBeInTheDocument();
  });

  it("filters by environment any-of, without asking the server again", async () => {
    await renderLibrary(mintingSession());
    await screen.findByText("Bog Owlbear");

    const requests = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Barrow" }));

    await waitFor(() => expect(screen.queryByText("Goblin Boss")).toBeNull());
    expect(screen.getByText("Barrow Sexton")).toBeInTheDocument();
    expect(screen.getByText("Bog Owlbear")).toBeInTheDocument();
    // A one-element array does not survive the wire (`load.ts`), and it does not
    // need to: every row carries its own `environments`.
    expect(server.calls.length).toBe(requests);
  });

  it("orders through the server, because the CR sort is on a key the client has not got", async () => {
    await renderLibrary(mintingSession());
    await screen.findByText("Bog Owlbear");

    expect(lastQuery().get("sort")).toBe("cr");

    await userEvent.click(screen.getByRole("combobox", { name: "Sort creatures" }));
    await userEvent.click(await screen.findByRole("option", { name: "Sort: Name" }));

    await waitFor(() => expect(lastQuery().get("sort")).toBe("name"));
  });

  describe("authoring, which is what the Library is for", () => {
    it("writes a creature into no campaign at all", async () => {
      server.routes.set("POST /library/creatures", { status: 200, body: owlbear });
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: /Write a creature/ }));
      await fillRequired("Fen Lurker");
      await userEvent.click(screen.getByRole("button", { name: "Add to your Library" }));

      await waitFor(() => expect(server.calls.some((call) => call.method === "POST")).toBe(true));
      const sent = bodyOf(server, "POST", "/library/creatures");
      // No campaign in the path and none in the payload: authoring is not an act
      // inside a campaign. And no `visibility` — `CreatureLibraryCreate` has no
      // field for it, because a row in no campaign has no players to narrow
      // against.
      expect(sent).toMatchObject({
        name: "Fen Lurker",
        type: "Monstrosity",
        cr: "3",
        ac: 14,
        hp: 59,
      });
      expect(sent).not.toHaveProperty("visibility");
      expect(sent).not.toHaveProperty("campaignId");
      expect(sent).not.toHaveProperty("origin");

      // A write changes the shape of the list, so the screen re-reads.
      await waitFor(() => expect(libraryCalls().length).toBeGreaterThan(1));
    });

    it("writes both halves of a creature — the columns and the block you read out", async () => {
      server.routes.set("POST /library/creatures", { status: 200, body: owlbear });
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: /Write a creature/ }));
      await fillRequired("Fen Lurker");
      await userEvent.type(screen.getByLabelText("AC line"), "14 (natural armour)");
      await userEvent.click(screen.getByRole("button", { name: /Add a trait/ }));
      await userEvent.type(screen.getByLabelText("Trait"), "Drag Under");
      await userEvent.type(screen.getByLabelText("Trait 1 text"), "Pulls a grappled target down.");
      await userEvent.type(screen.getByLabelText("Dice"), "2d8+3");
      await userEvent.click(screen.getByRole("button", { name: "Add to your Library" }));

      await waitFor(() => expect(bodyOf(server, "POST", "/library/creatures")).toBeDefined());
      // Neither half derives from the other — `"14 (natural armour)"` is not
      // recoverable from `14` — so both are sent.
      expect(bodyOf(server, "POST", "/library/creatures")).toMatchObject({
        ac: 14,
        statBlock: {
          ac: "14 (natural armour)",
          traits: [{ name: "Drag Under", text: "Pulls a grappled target down.", dice: "2d8+3" }],
        },
      });
    });

    it("refuses to send a creature with no name, and says so before the schema does", async () => {
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: /Write a creature/ }));
      await userEvent.click(screen.getByRole("button", { name: "Add to your Library" }));

      expect(await screen.findByText("Give it a name.")).toBeInTheDocument();
      expect(server.calls.some((call) => call.method === "POST")).toBe(false);
    });

    it("opens an edit on what is already there, and patches it", async () => {
      server.routes.set(`PATCH /library/creatures/${owlbear.id}`, { status: 200, body: owlbear });
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: "Edit Bog Owlbear" }));
      const name = await screen.findByLabelText("Name");
      expect(name).toHaveValue("Bog Owlbear");
      // The document's own lines are there to edit too, not only the columns.
      expect(screen.getByLabelText("Subtitle")).toHaveValue("Large monstrosity, unaligned");

      await userEvent.clear(name);
      await userEvent.type(name, "Fen Owlbear");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(bodyOf(server, "PATCH", "/library/creatures")).toBeDefined());
      expect(bodyOf(server, "PATCH", "/library/creatures")).toMatchObject({ name: "Fen Owlbear" });
    });

    it("keeps ability cells it never drew, rather than erasing them", async () => {
      server.routes.set(`PATCH /library/creatures/${owlbear.id}`, { status: 200, body: owlbear });
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: "Edit Bog Owlbear" }));
      await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));

      // No control is drawn for them, so the whole document goes back with the
      // parts this form shows replaced — the rule `CharacterDialog` follows for
      // the sheet keys it is not shown.
      await waitFor(() => expect(bodyOf(server, "PATCH", "/library/creatures")).toBeDefined());
      expect(bodyOf(server, "PATCH", "/library/creatures")).toMatchObject({
        statBlock: { abilities: owlbear.statBlock.abilities },
      });
    });

    it("deletes one, and says what happens to the copies already made", async () => {
      server.routes.set(`DELETE /library/creatures/${owlbear.id}`, { status: 204, body: null });
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: "Edit Bog Owlbear" }));
      // The captain's decision, rendered rather than hidden: a copy is a
      // snapshot, so deleting the original leaves it standing.
      expect(
        await screen.findByText("Copies already in your campaigns stay where they are."),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() =>
        expect(
          server.calls.some(
            (call) =>
              call.method === "DELETE" && call.pathname === `/library/creatures/${owlbear.id}`,
          ),
        ).toBe(true),
      );
      await waitFor(() => expect(libraryCalls().length).toBeGreaterThan(1));
    });

    it("offers no delete on a creature that does not exist yet", async () => {
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: /Write a creature/ }));
      await screen.findByLabelText("Name");
      expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    });
  });

  describe("copying into a campaign", () => {
    it("names the campaign, sends the copy there, and says what a copy is", async () => {
      server.routes.set(`POST /campaigns/${otherCampaignId}/creatures/${owlbear.id}/derive`, {
        status: 200,
        body: { ...owlbear, id: bandit.id, campaignId: otherCampaignId, accountId: null },
      });
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: "Stat block for Bog Owlbear" }));

      // The sentence that has to be on screen before the press, not after it.
      expect(
        await screen.findByText(/The campaign gets a copy of this creature as it is now/),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("combobox", { name: "Copy into" }));
      await userEvent.click(await screen.findByRole("option", { name: "The Hag's Bargain" }));
      await userEvent.click(screen.getByRole("button", { name: /Copy in/ }));

      await waitFor(() =>
        expect(
          server.calls.some(
            (call) =>
              call.method === "POST" &&
              call.pathname === `/campaigns/${otherCampaignId}/creatures/${owlbear.id}/derive`,
          ),
        ).toBe(true),
      );
      // The other consequence the captain confirmed: nothing refuses a second
      // copy, so the screen says so rather than looking idempotent.
      expect(await screen.findByText(/Copying again makes a second copy/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open its bestiary" })).toHaveAttribute(
        "href",
        `/#/campaigns/${otherCampaignId}/bestiary`,
      );
    });

    it("offers the tables this account runs, and copies a bundled creature too", async () => {
      server.routes.set(`POST /campaigns/${campaignId}/creatures/${goblin.id}/derive`, {
        status: 200,
        body: { ...goblin, id: bandit.id, campaignId, origin: "authored" },
      });
      await renderLibrary(mintingSession());
      await screen.findByText("Goblin Boss");

      await userEvent.click(screen.getByRole("button", { name: "Stat block for Goblin Boss" }));
      // A bundled row cannot be edited and can absolutely be used — which is
      // what "changing it means keeping a copy of your own" has always meant.
      await userEvent.click(await screen.findByRole("button", { name: /Copy in/ }));

      await waitFor(() =>
        expect(
          server.calls.some(
            (call) => call.pathname === `/campaigns/${campaignId}/creatures/${goblin.id}/derive`,
          ),
        ).toBe(true),
      );
    });

    it("says so plainly when there is no table to copy into", async () => {
      // An account can have a Library and no campaign — authoring is not an act
      // inside one — so this is a real state rather than an edge case.
      server.routes.set("GET /me/campaigns", { status: 200, body: [] });
      await renderLibrary(mintingSession());
      await screen.findByText("Bog Owlbear");

      await userEvent.click(screen.getByRole("button", { name: "Stat block for Bog Owlbear" }));

      expect(await screen.findByText(/not running a table yet/)).toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Copy into" })).toBeNull();
    });
  });

  it("says what fills an empty Library, which is writing something", async () => {
    server.routes.set(LIST, { status: 200, body: [] });
    await renderLibrary(mintingSession());

    expect(await screen.findByText("Nothing lives here")).toBeInTheDocument();
    expect(screen.getByText(/Write your first creature/)).toBeInTheDocument();
    expect(screen.getByText("pnpm -F server bestiary:import")).toBeInTheDocument();
    // Not "join a table": that was the answer when this list gathered campaign
    // rows, and it is the sentence the model change made wrong.
    expect(screen.queryByText(/invitation/)).toBeNull();
  });

  it("says something different when it is the filter that emptied the list", async () => {
    await renderLibrary(mintingSession());
    await screen.findByText("Bog Owlbear");

    server.routes.set(LIST, { status: 200, body: [] });
    await userEvent.type(screen.getByRole("textbox", { name: "Search the library" }), "dragon");

    expect(await screen.findByText(/Loosen a filter/)).toBeInTheDocument();
    expect(screen.queryByText(/bestiary:import/)).toBeNull();

    // And there is a way back out of it.
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    wholeLibrary();
    await waitFor(() => expect(lastQuery().get("q")).toBe(""));
  });

  it("says where a credential comes from when the one it has is refused", async () => {
    // **A token the server does not know, not the absence of one.** Since the
    // signed-out gate landed, a visitor with *no* credential at all never
    // reaches this route — `marketing/SignedOutGate.tsx` renders the homepage
    // above every match — so the reachable 401 is a stale or revoked machine
    // token, which is what this installs. Measured in Chromium: `#/library`
    // with an empty `localStorage` draws *"Run the fight, not the
    // spreadsheet"*, not this notice.
    window.localStorage.setItem("taverns.token", "a-token-the-server-forgot");
    server.routes.set(LIST, {
      status: 401,
      body: { _tag: "Unauthorized", message: "no token" },
    });
    await renderLibrary();

    expect(await screen.findByText("No credential yet")).toBeInTheDocument();
    expect(screen.getByText(/pnpm -F server token:issue/)).toBeInTheDocument();
  });

  it("says the server did not answer, and offers to try again", async () => {
    server.transportDown = true;
    await renderLibrary(mintingSession());

    expect(await screen.findByText("The server did not answer")).toBeInTheDocument();

    server.transportDown = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Bog Owlbear")).toBeInTheDocument();
  });

  it("sits on the global row, above any campaign, with no campaign row at all", async () => {
    await renderLibrary(mintingSession());
    await screen.findByText("Bog Owlbear");

    const item = within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", {
      name: "Library",
    });
    expect(item).toHaveAttribute("href", "/#/library");
    expect(item).toHaveAttribute("aria-current", "page");

    // The second row exists exactly when the route names a campaign, and this
    // one names none — so there is no row rather than an empty one.
    expect(screen.queryByRole("navigation", { name: "This campaign" })).toBeNull();
  });
});
