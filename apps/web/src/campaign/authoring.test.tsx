import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bodyOf,
  campaign,
  campaignId,
  character,
  encounter,
  encounterId,
  goblinId,
  installMemoryStorage,
  installStubServer,
  liveRun,
  mintingSession,
  prepItem,
  prepItemId,
  readAloud,
  renderScreen,
  rosterRowId,
  session,
  sessionId,
} from "./campaign.fixtures";

/**
 * The campaign view *writing*.
 *
 * Four things each form has to get right, and each has a test here: the payload
 * that goes on the wire, the visibility default, what a refused draft does
 * before anything is sent, and what a refusal from the server looks like on
 * screen. The reads are `CampaignScreen.test.tsx`; the fixtures are shared.
 */

const server = installStubServer();
installMemoryStorage();

const campaignPath = `/campaigns/${campaignId}`;
const encountersPath = `/campaigns/${campaignId}/encounters`;
const notesPath = `/campaigns/${campaignId}/notes`;
const charactersPath = `/campaigns/${campaignId}/characters`;
const prepPath = `/campaigns/${campaignId}/sessions/${sessionId}/prep`;

const created = (name: string) => ({
  status: 200,
  body: { ...encounter, id: encounterId, name, tags: [], creatureCount: 0 },
});

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

/** Opens the dialog behind the top bar's one create slot. */
const openCreate = async (label: string) => {
  renderScreen(mintingSession());
  await screen.findByRole("heading", { name: "The Salt Road" });
  await userEvent.click(await screen.findByRole("button", { name: label }));
};

describe("authoring an encounter", () => {
  it("names it, rates it, tags it, and attaches a creature — in one save", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Ambush in the reeds"));
    server.routes.set(`POST ${encountersPath}/${encounterId}/creatures`, {
      status: 200,
      body: {
        id: rosterRowId,
        encounterId,
        creatureId: goblinId,
        count: 4,
        visibility: "dm",
        origin: "authored",
        assistantTurnId: null,
        createdAt: "2026-08-04T13:03:28.070Z",
        updatedAt: "2026-08-04T13:03:28.070Z",
      },
    });

    await openCreate("New encounter");

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Name" }),
      "Ambush in the reeds",
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Tags" }), "Marsh, Night");

    await userEvent.click(screen.getByRole("combobox", { name: "Difficulty" }));
    await userEvent.click(await screen.findByRole("option", { name: "Deadly" }));

    // The picker is the bestiary API, campaign-scoped in the path — so the
    // global `system` corpus arrives through it and needs no second call.
    await userEvent.click(await screen.findByRole("button", { name: "Add Goblin Boss" }));
    const count = screen.getByRole("spinbutton", { name: "How many Goblin Boss" });
    await userEvent.clear(count);
    await userEvent.type(count, "4");

    await userEvent.click(screen.getByRole("button", { name: "Create encounter" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toEqual({
        name: "Ambush in the reeds",
        difficulty: "Deadly",
        tags: ["Marsh", "Night"],
        // The DM did not touch the switch, so this is the column default said
        // out loud — not a guess, and not `shared`.
        visibility: "dm",
      }),
    );

    // The roster is a different table, saved by the same button inside the same
    // Effect: an encounter that exists with an empty roster is the half-saved
    // state this ordering exists to make impossible to *start* from.
    await waitFor(() =>
      expect(bodyOf(server, "POST", `/encounters/${encounterId}/creatures`)).toEqual({
        creatureId: goblinId,
        count: 4,
      }),
    );
  });

  it("sends shared only when the DM says so", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Open to the table"));
    await openCreate("New encounter");

    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Open to the table");
    expect(screen.getByText("Only you can see this encounter.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Players can see this" }));
    expect(screen.getByText(/Your players can see this encounter/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create encounter" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toMatchObject({ visibility: "shared" }),
    );
  });

  it("refuses a nameless encounter before anything is sent", async () => {
    await openCreate("New encounter");

    await userEvent.click(await screen.findByRole("button", { name: "Create encounter" }));

    expect(await screen.findByText("Give it a name.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute("aria-invalid", "true");
    // The contract would have caught it too — the derived client encodes through
    // the same schema the handler decodes with — but not before a round trip and
    // not in words a DM can act on.
    expect(server.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("says so, in the form, when the server refuses the save", async () => {
    // No route for the POST: the stub answers 404 NotFound, which is what a
    // campaign that has gone away underneath an open dialog looks like.
    await openCreate("New encounter");

    await userEvent.type(await screen.findByRole("textbox", { name: "Name" }), "Too late");
    await userEvent.click(screen.getByRole("button", { name: "Create encounter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That campaign is gone, or it belongs to someone else.",
    );
    // Still open, with the DM's words still in it: a dialog that closed on a
    // failure would have thrown the draft away.
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Too late");
  });

  it("opens on what is already there, and patches with a null to unrate", async () => {
    server.routes.set(`PATCH ${encountersPath}/${encounterId}`, {
      status: 200,
      body: { ...encounter, difficulty: null },
    });
    renderScreen(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Edit Ambush in the reeds" }));

    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("Ambush in the reeds");
    expect(screen.getByRole("textbox", { name: "Tags" })).toHaveValue("Marsh, Night");
    // The roster arrives from `encounter_creature`, with the name looked up in
    // the bestiary — a roster line carries an id, not a copy of the creature.
    expect(screen.getByRole("spinbutton", { name: "How many Goblin Boss" })).toHaveValue(6);

    await userEvent.click(screen.getByRole("combobox", { name: "Difficulty" }));
    await userEvent.click(await screen.findByRole("option", { name: "Unrated" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // `null` on update, where create omits the field: an encounter that has
    // never been rated has no value, and one the DM un-rated has a null.
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/encounters/${encounterId}`)).toMatchObject({
        difficulty: null,
      }),
    );
  });

  it("drops a roster line by deleting the row, not by forgetting it", async () => {
    server.routes.set(`PATCH ${encountersPath}/${encounterId}`, { status: 200, body: encounter });
    server.routes.set(`DELETE ${encountersPath}/${encounterId}/creatures/${rosterRowId}`, {
      status: 204,
      body: null,
    });
    renderScreen(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Edit Ambush in the reeds" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove Goblin Boss" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(
        server.calls.some(
          (call) => call.method === "DELETE" && call.pathname.endsWith(`/creatures/${rosterRowId}`),
        ),
      ).toBe(true),
    );
  });
});

describe("authoring a note", () => {
  const openNotes = async () => {
    renderScreen(mintingSession());
    await screen.findByRole("heading", { name: "The Salt Road" });
    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
  };

  it("writes read-aloud prose attached to an encounter", async () => {
    server.routes.set(`POST ${notesPath}`, { status: 200, body: readAloud });
    await openNotes();

    // The create slot is named for the open tab — there is one, and it is the
    // prototype's.
    await userEvent.click(await screen.findByRole("button", { name: "New note" }));

    await userEvent.type(
      await screen.findByRole("textbox", { name: "Title" }),
      "Read aloud at the water",
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Kind" }));
    await userEvent.click(await screen.findByRole("option", { name: "Read aloud" }));

    await userEvent.type(
      screen.getByRole("textbox", { name: "What you read out" }),
      "The reeds are taller than you are.",
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Attached to" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ambush in the reeds" }));

    await userEvent.click(screen.getByRole("button", { name: "Create note" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/notes")).toEqual({
        title: "Read aloud at the water",
        body: "The reeds are taller than you are.",
        kind: "read_aloud",
        visibility: "dm",
        // A union member, not a bare id: `creature` joins this shape later.
        attachedTo: { kind: "encounter", id: encounterId },
      }),
    );
  });

  it("detaches with a null, which is what update means by it", async () => {
    server.routes.set(`PATCH ${notesPath}/${readAloud.id}`, { status: 200, body: readAloud });
    await openNotes();

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Read aloud at the water" }),
    );
    await userEvent.click(await screen.findByRole("combobox", { name: "Attached to" }));
    await userEvent.click(await screen.findByRole("option", { name: "Nothing" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", "/notes/")).toMatchObject({ attachedTo: null }),
    );
  });

  it("refuses an untitled note before anything is sent", async () => {
    await openNotes();
    await userEvent.click(await screen.findByRole("button", { name: "New note" }));
    await userEvent.click(await screen.findByRole("button", { name: "Create note" }));

    expect(await screen.findByText("Give it a title.")).toBeInTheDocument();
    expect(server.calls.some((call) => call.method === "POST")).toBe(false);
  });
});

/**
 * The master toggle. `campaign.visibility` gates every per-row share in the
 * product, and until this dialog existed nothing in `apps/web` could set it —
 * so the four tests here are about the one field, not about the three beside it.
 */
describe("sharing a campaign", () => {
  const openSettings = async () => {
    renderScreen(mintingSession());
    await screen.findByRole("heading", { name: "The Salt Road" });
    await userEvent.click(await screen.findByRole("button", { name: /campaign settings/ }));
  };

  it("says on the screen itself which answer the campaign currently gives", async () => {
    renderScreen(mintingSession());

    // The fixture campaign is `dm`, and a DM should not have to open anything
    // — or infer it from an absent badge — to know that.
    const button = await screen.findByRole("button", { name: /campaign settings/ });
    expect(button).toHaveAccessibleName("Private to you — campaign settings");
    expect(button).toHaveTextContent("Private");
  });

  it("shares it, and says what sharing does before the DM commits", async () => {
    server.routes.set(`PATCH ${campaignPath}`, {
      status: 200,
      body: { ...campaign, visibility: "shared" },
    });
    await openSettings();

    expect(await screen.findByText(/This campaign is yours alone/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Players can see this" }));
    expect(screen.getByText(/Your players can reach this campaign/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", campaignPath)).toEqual({
        name: "The Salt Road",
        partyName: "The Gilded Spoon",
        playerCount: 4,
        visibility: "shared",
      }),
    );
  });

  it("re-reads, so the bar stops saying Private the moment it is not", async () => {
    const shared = { status: 200, body: { ...campaign, visibility: "shared" } };
    server.routes.set(`PATCH ${campaignPath}`, shared);
    await openSettings();
    await userEvent.click(screen.getByRole("switch", { name: "Players can see this" }));

    // Re-aimed while the save is still the DM's to make: the write changes what
    // the *read* answers, and it is the read the screen believes.
    server.routes.set(`GET ${campaignPath}`, shared);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /campaign settings/ })).toHaveTextContent("Shared"),
    );
    // And it got there by asking again, not by patching its own copy — which is
    // the rule every structural write on this screen follows, because a write
    // moves things the screen did not send.
    const patched = server.calls.findIndex(
      (call) => call.method === "PATCH" && call.pathname === campaignPath,
    );
    expect(
      server.calls
        .slice(patched + 1)
        .some((call) => call.method === "GET" && call.pathname === campaignPath),
    ).toBe(true);
  });

  it("refuses an unnamed campaign, and a player count that is not one", async () => {
    await openSettings();

    const name = await screen.findByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    const players = screen.getByRole("spinbutton", { name: "Players" });
    await userEvent.clear(players);
    await userEvent.type(players, "99");

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Give it a name.")).toBeInTheDocument();
    expect(screen.getByText("Somewhere between none and 64.")).toBeInTheDocument();
    expect(server.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("says so, in the dialog, when the server refuses the save", async () => {
    // No PATCH route: the stub answers 404, which is a campaign that has gone
    // away under an open dialog.
    await openSettings();
    await userEvent.click(await screen.findByRole("switch", { name: "Players can see this" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That campaign is gone, or it belongs to someone else.",
    );
    // Still open, and still holding the DM's answer.
    expect(screen.getByRole("switch", { name: "Players can see this" })).toBeChecked();
  });
});

describe("authoring a character", () => {
  const openParty = async () => {
    renderScreen(mintingSession());
    await screen.findByRole("heading", { name: "The Salt Road" });
    await userEvent.click(screen.getByRole("tab", { name: "Party" }));
  };

  it("writes one down, omitting what the DM left blank", async () => {
    server.routes.set(`POST ${charactersPath}`, { status: 200, body: character });
    await openParty();

    // The one create slot, named for the open tab — Party had none until now.
    await userEvent.click(await screen.findByRole("button", { name: "Add character" }));

    await userEvent.type(await screen.findByRole("textbox", { name: "Character" }), "Brannoc");
    await userEvent.type(screen.getByRole("textbox", { name: "Player" }), "Ilse");
    await userEvent.type(screen.getByRole("spinbutton", { name: "AC" }), "18");

    await userEvent.click(screen.getByRole("button", { name: "Add character" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/characters")).toEqual({
        name: "Brannoc",
        playerName: "Ilse",
        ac: 18,
        // `descriptor` and `hpMax` are absent rather than null: `CharacterCreate`
        // takes no null, and an unfilled number is not a zero — `PartyList`
        // renders each stat only when there is one.
        visibility: "dm",
      }),
    );
  });

  it("sends shared only when the DM says so", async () => {
    server.routes.set(`POST ${charactersPath}`, { status: 200, body: character });
    await openParty();
    await userEvent.click(await screen.findByRole("button", { name: "Add character" }));

    await userEvent.type(await screen.findByRole("textbox", { name: "Character" }), "Brannoc");
    expect(screen.getByText("Only you can see this character.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Players can see this" }));

    await userEvent.click(screen.getByRole("button", { name: "Add character" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/characters")).toMatchObject({ visibility: "shared" }),
    );
  });

  it("opens on what is already there, and clears a field with a null", async () => {
    server.routes.set(`PATCH ${charactersPath}/${character.id}`, {
      status: 200,
      body: { ...character, descriptor: null },
    });
    await openParty();

    await userEvent.click(await screen.findByRole("button", { name: "Edit Brannoc" }));

    expect(await screen.findByRole("textbox", { name: "Character" })).toHaveValue("Brannoc");
    expect(screen.getByRole("textbox", { name: "Player" })).toHaveValue("Ilse");
    expect(screen.getByRole("spinbutton", { name: "Hit points" })).toHaveValue(52);

    await userEvent.clear(screen.getByRole("textbox", { name: "Descriptor" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // A null on update where create omits the field: emptying a box means
    // "there is no answer", and omitting it would leave the old one.
    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/characters/${character.id}`)).toEqual({
        name: "Brannoc",
        playerName: "Ilse",
        descriptor: null,
        ac: 18,
        hpMax: 52,
        visibility: "dm",
      }),
    );
  });

  it("refuses a nameless character, and a number out of range, before anything is sent", async () => {
    await openParty();
    await userEvent.click(await screen.findByRole("button", { name: "Add character" }));

    await userEvent.type(await screen.findByRole("spinbutton", { name: "AC" }), "99");
    await userEvent.click(screen.getByRole("button", { name: "Add character" }));

    expect(await screen.findByText("Give them a name.")).toBeInTheDocument();
    expect(screen.getByText("Between 0 and 40.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Character" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(server.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("says so, in the form, when the server refuses the save", async () => {
    await openParty();
    await userEvent.click(await screen.findByRole("button", { name: "Add character" }));

    await userEvent.type(await screen.findByRole("textbox", { name: "Character" }), "Too late");
    await userEvent.click(screen.getByRole("button", { name: "Add character" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That campaign is gone, or it belongs to someone else.",
    );
    expect(screen.getByRole("textbox", { name: "Character" })).toHaveValue("Too late");
  });
});

describe("authoring the checklist", () => {
  it("adds a line, and re-reads rather than growing the list locally", async () => {
    server.routes.set(`POST ${prepPath}`, {
      status: 200,
      body: { ...prepItem, id: prepItemId, label: "Print the map" },
    });
    renderScreen(mintingSession());

    const field = await screen.findByRole("textbox", { name: "Add to the checklist" });
    await userEvent.type(field, "Print the map");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/prep")).toEqual({ label: "Print the map" }),
    );
    // No `visibility` on the wire: the column default is `dm`, and the checklist
    // being out of a player's reach is a property of the table rather than of a
    // control someone has to remember to leave alone.

    // The list came back from the server, so a second GET is the proof it did.
    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "GET" && call.pathname.endsWith("/prep"))
          .length,
      ).toBeGreaterThan(1),
    );
  });

  it("renames a line in place", async () => {
    server.routes.set(`PATCH ${prepPath}/${prepItemId}`, {
      status: 200,
      body: { ...prepItem, label: "Reread the ambush" },
    });
    renderScreen(mintingSession());

    await userEvent.click(
      await screen.findByRole("button", { name: "Rename Reread the reeds ambush" }),
    );
    const field = await screen.findByRole("textbox", { name: "Rename Reread the reeds ambush" });
    await userEvent.clear(field);
    await userEvent.type(field, "Reread the ambush{Enter}");

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", "/prep/")).toEqual({ label: "Reread the ambush" }),
    );
  });

  it("keeps the old name on Escape, and sends nothing", async () => {
    renderScreen(mintingSession());

    await userEvent.click(
      await screen.findByRole("button", { name: "Rename Reread the reeds ambush" }),
    );
    const field = await screen.findByRole("textbox", { name: "Rename Reread the reeds ambush" });
    await userEvent.clear(field);
    await userEvent.type(field, "Something else{Escape}");

    expect(
      await screen.findByRole("checkbox", { name: "Reread the reeds ambush" }),
    ).toBeInTheDocument();
    expect(server.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("removes a line, and says so when the server will not", async () => {
    // `NotFound` is the only refusal this endpoint declares — and it is also
    // what "you may not see it" answers, on purpose.
    server.routes.set(`DELETE ${prepPath}/${prepItemId}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "prep item", id: prepItemId },
    });
    renderScreen(mintingSession());

    await userEvent.click(
      await screen.findByRole("button", { name: "Remove Reread the reeds ambush" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That prep item is gone, or it belongs to someone else.",
    );
  });

  it("removes a line, and re-reads the checklist", async () => {
    server.routes.set(`DELETE ${prepPath}/${prepItemId}`, { status: 204, body: null });
    renderScreen(mintingSession());

    await userEvent.click(
      await screen.findByRole("button", { name: "Remove Reread the reeds ambush" }),
    );

    await waitFor(() =>
      expect(
        server.calls.filter((call) => call.method === "GET" && call.pathname.endsWith("/prep"))
          .length,
      ).toBeGreaterThan(1),
    );
  });
});

/**
 * *Start session* — the only way into the runner, and the one form in the app
 * that has to make three tables agree in a single submit.
 */
describe("starting a session", () => {
  const runsPath = `/campaigns/${campaignId}/sessions/${sessionId}/runs`;

  it("runs an encounter in the session that already exists", async () => {
    server.routes.set(`POST ${runsPath}`, { status: 200, body: liveRun });
    renderScreen(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Start session" }));
    await screen.findByText("Put an encounter on the table");
    // No session is invented: the campaign already names one.
    expect(screen.getByText(/This runs in session 12/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Ambush in the reeds" }));
    await userEvent.click(screen.getByRole("button", { name: "Start the fight" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/sessions/${sessionId}/runs`)).toEqual({
        encounterId,
        // `includeParty` is absent because the server's default is yes, and a
        // fight without the party in initiative is not a fight. Fail-closed
        // `dm` is said out loud, because that is a boundary.
        visibility: "dm",
      }),
    );
    expect(
      server.calls.some((call) => call.method === "POST" && call.pathname.endsWith("/sessions")),
    ).toBe(false);
  });

  it("creates the session, points the campaign at it, and stamps it started", async () => {
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, currentSessionId: null },
    });
    server.routes.set(`GET /campaigns/${campaignId}/sessions`, {
      status: 200,
      body: [{ ...session, number: 12 }],
    });
    server.routes.set(`POST /campaigns/${campaignId}/sessions`, { status: 200, body: session });
    server.routes.set(`PATCH /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, currentSessionId: sessionId },
    });
    server.routes.set(`POST ${runsPath}`, { status: 200, body: liveRun });
    renderScreen(mintingSession());

    await userEvent.click(await screen.findByRole("button", { name: "Start session" }));
    // One past the highest that exists, which is the only thing the list is read for.
    await screen.findByText(/This starts session 13/);

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(await screen.findByRole("option", { name: "Ambush in the reeds" }));
    await userEvent.click(screen.getByRole("button", { name: "Start the fight" }));

    await waitFor(() =>
      expect(bodyOf(server, "POST", `/campaigns/${campaignId}/sessions`)).toEqual({ number: 13 }),
    );
    // The prep screen reads the night off the campaign, so the pointer moves
    // with it or the two screens disagree about which night this is.
    expect(bodyOf(server, "PATCH", `/campaigns/${campaignId}`)).toEqual({
      currentSessionId: sessionId,
    });
    expect(
      (bodyOf(server, "PATCH", `/sessions/${sessionId}`) as { startedAt: string }).startedAt,
    ).toMatch(/^\d{4}-/);
  });

  it("offers the way back rather than a second fight when one is on the table", async () => {
    server.routes.set(`GET ${runsPath}`, { status: 200, body: [liveRun] });
    renderScreen(mintingSession());

    // Exactly one encounter is live, so the campaign says which — the
    // fixtures' `active: true`.
    await screen.findByRole("button", { name: "Back to the fight" });
    expect(screen.queryByRole("button", { name: "Start session" })).toBeNull();
    expect(screen.getByRole("button", { name: /On the table now/ })).toBeInTheDocument();
  });
});

describe("finishing the night", () => {
  const runsPath = `/campaigns/${campaignId}/sessions/${sessionId}/runs`;
  const sessionPath = `/campaigns/${campaignId}/sessions/${sessionId}`;

  /** Opens the confirmation from the session card in the aside. */
  const openFinish = async () => {
    renderScreen(mintingSession());
    await userEvent.click(await screen.findByRole("button", { name: "Finish the night" }));
  };

  it("offers the night's own ending on the screen that shows which night it is", async () => {
    renderScreen(mintingSession());
    // In the aside, on a card that names the session and says where it stands —
    // so the ending is attached to the thing it ends, rather than sitting a
    // thumb's width from the two buttons a DM presses all evening.
    const card = (await screen.findByRole("button", { name: "Finish the night" })).closest(
      "[data-slot='card']",
    );
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Session 12")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText(/Not started yet/)).toBeInTheDocument();
  });

  it("says what will happen, and does nothing until the DM confirms", async () => {
    await openFinish();

    await screen.findByText("Finish session 12?");
    // All three halves of the transition, out loud: the night closes, the
    // campaign stops pointing at it, and the next fight starts a new one.
    expect(screen.getByText(/stops pointing at session 12/)).toBeInTheDocument();
    expect(screen.getByText(/next encounter you run starts a new one/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
    // Opening the dialog is not the ending.
    expect(server.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("stamps the end time, and re-reads the campaign the session fell out of", async () => {
    server.routes.set(`GET ${sessionPath}`, { status: 200, body: session });
    server.routes.set(`PATCH ${sessionPath}`, {
      status: 200,
      body: { ...session, endedAt: "2026-08-04T23:40:00.000Z" },
    });
    await openFinish();

    await screen.findByText("Finish session 12?");
    await userEvent.click(screen.getByRole("button", { name: "Finish the night" }));

    await waitFor(() =>
      expect(
        (bodyOf(server, "PATCH", `/sessions/${sessionId}`) as { endedAt: string }).endedAt,
      ).toMatch(/^\d{4}-/),
    );
    // Nothing else is written: clearing `campaign.current_session_id` is the
    // server's half of the same transaction, not a second call from here.
    expect(
      server.calls.some(
        (call) => call.method === "PATCH" && call.pathname.endsWith(`/${campaignId}`),
      ),
    ).toBe(false);
    // The screen re-reads, because the night is gone from under it.
    await waitFor(() =>
      expect(
        server.calls.filter(
          (call) => call.method === "GET" && call.pathname.endsWith(`/${campaignId}`),
        ).length,
      ).toBeGreaterThan(1),
    );
  });

  it("carries a fight on the table rather than refusing the night", async () => {
    // This screen used to refuse outright, and `session/finish.ts` recorded the
    // refusal as the safe half of a question nobody had answered. The captain
    // answered it — a fight carries across nights — so the confirmation is
    // offered, and what changes is that the dialog says which fight is going
    // with it.
    server.routes.set(`GET ${runsPath}`, { status: 200, body: [liveRun] });
    await openFinish();

    await screen.findByText("Finish session 12?");
    expect(screen.getByText(/Ambush in the reeds is still on the table/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finish the night" }));

    await waitFor(() =>
      expect(
        (bodyOf(server, "PATCH", `/sessions/${sessionId}`) as { endedAt: string }).endedAt,
      ).toMatch(/^\d{4}-/),
    );
    // Taking the run off the table as `carried` is the server's half of the
    // same transaction. A client that also ended it would be writing
    // `resolved` over the answer.
    expect(server.calls.some((call) => call.pathname.endsWith("/end"))).toBe(false);
  });

  it("does not re-read the runs before stamping, because there is no race left", async () => {
    // The old refusal was checked twice — once from the loaded run, once by
    // re-reading at submit time for a fight started in another tab. Neither
    // check exists now: the carry is performed inside the server's transaction,
    // so a fight that appears between the render and the click is carried too,
    // and there is nothing a stale render could get wrong.
    await openFinish();
    await screen.findByText("Finish session 12?");
    const readsBefore = server.calls.filter(
      (call) => call.method === "GET" && call.pathname === runsPath,
    ).length;

    await userEvent.click(screen.getByRole("button", { name: "Finish the night" }));
    await waitFor(() => expect(bodyOf(server, "PATCH", `/sessions/${sessionId}`)).toBeDefined());

    // Counted *up to* the stamp: the screen reloads afterwards, which reads the
    // runs again for an honest reason, and that must not be mistaken for the
    // check this test says is gone.
    const stamp = server.calls.findIndex(
      (call) => call.method === "PATCH" && call.pathname === sessionPath,
    );
    const readsAtSubmit = server.calls
      .slice(0, stamp)
      .filter((call) => call.method === "GET" && call.pathname === runsPath).length;
    expect(readsAtSubmit).toBe(readsBefore);
  });

  it("says so, in the dialog, when the server refuses the save", async () => {
    server.routes.set(`PATCH ${sessionPath}`, {
      status: 409,
      body: { _tag: "Conflict", message: "that night is already over" },
    });
    await openFinish();

    await screen.findByText("Finish session 12?");
    await userEvent.click(screen.getByRole("button", { name: "Finish the night" }));

    expect(await screen.findByText("that night is already over")).toBeInTheDocument();
  });
});
