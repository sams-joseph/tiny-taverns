import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import {
  bodyOf,
  campaign,
  campaignId,
  encounter,
  encounterId,
  encounterPrep,
  goblinId,
  installStubServer,
  noteId,
  page,
  readAloud,
  rosterRowId,
} from "./campaign.fixtures";

/**
 * The encounter builder, `/encounters/new` and `/encounters/<id>/edit`: the
 * one page every encounter is written on. What goes on the wire, what is
 * refused before anything is sent, where a save lands, and that nothing is
 * left without asking. The draft's own rules are `encounterDraft.test.ts`;
 * the ways in are on the screens that link here.
 */

const server = installStubServer();

beforeEach(() => {
  server.reset();
  globalThis.history.replaceState(null, "", "/");
});
afterEach(() => cleanup());

const encountersPath = `/campaigns/${campaignId}/encounters`;
const newPath = `${encountersPath}/new`;
const editPath = `${encountersPath}/${encounterId}/edit`;

const created = (name: string) => ({
  status: 200,
  body: { ...encounter, id: encounterId, name, tags: [], creatureCount: 0 },
});

const openNew = async () => {
  await renderAt(newPath);
  return screen.findByRole("textbox", { name: "Name" });
};

const openEdit = async () => {
  await renderAt(editPath);
  return screen.findByRole("textbox", { name: "Name" });
};

const save = () => userEvent.click(screen.getByRole("button", { name: "Save encounter" }));
const kind = (label: string) =>
  userEvent.click(
    within(screen.getByRole("group", { name: "Type" })).getByRole("button", { name: label }),
  );
const writes = () => server.calls.filter((call) => call.method !== "GET");

describe("writing a new encounter", () => {
  it("names it, tags it, and makes its roster in the one create", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Ambush in the reeds"));
    await userEvent.type(await openNew(), "Ambush in the reeds");
    await userEvent.type(screen.getByRole("textbox", { name: "Tags" }), "Marsh, Night");

    // The picker is the bestiary API, campaign-scoped in the path — so the
    // global `system` corpus arrives through it and needs no second call.
    await userEvent.click(await screen.findByRole("button", { name: "Add Goblin Boss" }));
    for (let press = 0; press < 3; press++) {
      await userEvent.click(screen.getByRole("button", { name: "One more Goblin Boss" }));
    }
    expect(screen.getByLabelText("How many Goblin Boss")).toHaveTextContent("4");
    expect(screen.getByText("800 xp")).toBeInTheDocument();

    await save();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toEqual({
        name: "Ambush in the reeds",
        // The type the DM did not change: a fight, said out loud. No tactics,
        // treasure or challenge were written, so none are sent.
        kind: "combat",
        tags: ["Marsh", "Night"],
        // The switches the DM did not touch: their defaults, said out loud.
        visibility: "dm",
        ready: false,
        // The roster rides on the create, which the server makes in one
        // transaction — no encounter is ever left without the lines it was
        // saved with.
        creatures: [{ creatureId: goblinId, count: 4 }],
      }),
    );
    expect(writes()).toHaveLength(1);
  });

  it("lands on the list with what it saved selected", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Ambush in the reeds"));
    await userEvent.type(await openNew(), "Ambush in the reeds");
    await save();

    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    expect(new URLSearchParams(globalThis.location.search).get("encounter")).toBe(encounterId);
    expect(await screen.findByRole("article", { name: "Ambush in the reeds" })).toBeInTheDocument();
  });

  it("asks where it happens, and sends it trimmed for the battle map", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Ambush in the reeds"));
    await userEvent.type(await openNew(), "Ambush in the reeds");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Location" }),
      "  A boardwalk over black water  ",
    );
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toMatchObject({
        setting: "A boardwalk over black water",
      }),
    );
  });

  it("sends shared only when the DM says so", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Open to the table"));
    await userEvent.type(await openNew(), "Open to the table");
    expect(screen.getByText("Only you can see this encounter.")).toBeInTheDocument();

    // A shared draft is still the DM's: the server shows players only an
    // encounter that is shared and Ready, and the switch says so.
    await userEvent.click(screen.getByRole("switch", { name: "Players can see this" }));
    expect(screen.getByText(/once you mark it Ready to run/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Ready to run" }));
    expect(screen.getByText(/Your players can see this encounter/)).toBeInTheDocument();
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toMatchObject({
        visibility: "shared",
        ready: true,
      }),
    );
  });

  it("sends Ready when the DM says it is ready to run", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Ready now"));
    await userEvent.type(await openNew(), "Ready now");
    const ready = screen.getByRole("switch", { name: "Ready to run" });
    expect(ready).not.toBeChecked();
    await userEvent.click(ready);
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toMatchObject({ ready: true }),
    );
  });

  it("refuses a nameless encounter before anything is sent", async () => {
    await openNew();
    await save();

    expect(await screen.findByText("Give it a name.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute("aria-invalid", "true");
    // The contract would have caught it too — the derived client encodes through
    // the same schema the handler decodes with — but not before a round trip and
    // not in words a DM can act on.
    expect(writes()).toEqual([]);
  });

  it("says so, on the page, when the server refuses the save", async () => {
    // No route for the POST: the stub answers 404 NotFound, which is what a
    // campaign that has gone away underneath an open page looks like.
    await userEvent.type(await openNew(), "Too late");
    await save();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That campaign is gone, or it belongs to someone else.",
    );
    // Still here, with the DM's words still in it.
    expect(globalThis.location.pathname).toBe(newPath);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Too late");
  });

  it("sets out a skill challenge, and writes its tactics one beat per line", async () => {
    server.routes.set(`POST ${encountersPath}`, created("The dry well"));
    await userEvent.type(await openNew(), "The dry well");
    // No challenge boxes until the type takes them.
    expect(screen.queryByRole("spinbutton", { name: "DC" })).toBeNull();
    await kind("Challenge");
    expect(
      within(screen.getByRole("group", { name: "Type" })).getByRole("button", {
        name: "Challenge",
      }),
    ).toHaveAttribute("aria-pressed", "true");

    // Blank, not a guess at the DM's numbers.
    expect(screen.getByRole("spinbutton", { name: "DC" })).toHaveValue(null);
    await userEvent.type(screen.getByRole("spinbutton", { name: "DC" }), "14");
    await userEvent.type(screen.getByRole("spinbutton", { name: "Successes needed" }), "3");
    await userEvent.type(screen.getByRole("spinbutton", { name: "Failures allowed" }), "2");
    await userEvent.click(screen.getByRole("button", { name: "Athletics" }));
    await userEvent.click(screen.getByRole("button", { name: "Survival" }));
    await userEvent.click(screen.getByRole("button", { name: "Stealth" }));
    await userEvent.click(screen.getByRole("button", { name: "Stealth" }));
    expect(screen.getByRole("button", { name: "Athletics" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // A blank line is a line not written.
    await userEvent.type(
      screen.getByRole("textbox", { name: "Running it" }),
      "Success: the buried cache.{Enter}{Enter}  Each failure costs a day's water. ",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Treasure" }),
      "  A waterskin that never empties ",
    );
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toMatchObject({
        name: "The dry well",
        kind: "challenge",
        challenge: {
          kind: "challenge",
          dc: 14,
          successes: 3,
          failures: 2,
          skills: ["Athletics", "Survival"],
        },
        tactics: ["Success: the buried cache.", "Each failure costs a day's water."],
        treasure: "A waterskin that never empties",
      }),
    );
  });

  it("asks a hazard for the save it forces before anything is sent", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Salt-flat sandstorm"));
    await userEvent.type(await openNew(), "Salt-flat sandstorm");
    await kind("Hazard");
    await userEvent.type(
      screen.getByRole("textbox", { name: "On a failed save" }),
      "1 level of exhaustion",
    );
    await save();

    expect(
      await screen.findByText(
        "A hazard needs the save it forces: an ability, and a DC from 1 to 30.",
      ),
    ).toBeInTheDocument();
    expect(writes()).toEqual([]);

    await userEvent.click(screen.getByRole("combobox", { name: "Saving throw" }));
    await userEvent.click(await screen.findByRole("option", { name: "CON" }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "Save DC" }), "13");
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toMatchObject({
        kind: "hazard",
        challenge: {
          kind: "hazard",
          save: { ability: "CON", dc: 13 },
          onFail: "1 level of exhaustion",
          skills: [],
        },
      }),
    );
    // No duration was written, so none is sent.
    expect(
      (bodyOf(server, "POST", "/encounters") as { challenge: object }).challenge,
    ).not.toHaveProperty("duration");
  });

  it("sends no challenge once the DM switches to a type that takes none", async () => {
    server.routes.set(`POST ${encountersPath}`, created("The hag's bargain"));
    await userEvent.type(await openNew(), "The hag's bargain");
    await kind("Challenge");
    await userEvent.type(screen.getByRole("spinbutton", { name: "DC" }), "14");
    await kind("Social");
    expect(screen.queryByRole("spinbutton", { name: "DC" })).toBeNull();
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toMatchObject({ kind: "social" }),
    );
    expect(bodyOf(server, "POST", "/encounters")).not.toHaveProperty("challenge");
  });
});

describe("editing an encounter", () => {
  beforeEach(() => {
    server.routes.set(`PATCH ${encountersPath}/${encounterId}`, { status: 200, body: encounter });
  });

  it("opens on what is already there, and patches what the DM changed", async () => {
    expect(await openEdit()).toHaveValue("Ambush in the reeds");
    expect(screen.getByRole("heading", { level: 1, name: "Edit encounter" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Tags" })).toHaveValue("Marsh, Night");
    // The setting line is the map's, read back through the creator's map read.
    expect(screen.getByRole("textbox", { name: "Location" })).toHaveValue(
      "A boardwalk over black water",
    );
    // The roster arrives from `encounter_creature`, named on the row.
    expect(screen.getByLabelText("How many Goblin Boss")).toHaveTextContent("6");

    const tags = screen.getByRole("textbox", { name: "Tags" });
    await userEvent.clear(tags);
    await userEvent.type(tags, "Marsh");
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/encounters/${encounterId}`)).toMatchObject({
        tags: ["Marsh"],
      }),
    );
    // Difficulty is computed from the roster and the party: no field for it.
    expect(bodyOf(server, "PATCH", `/encounters/${encounterId}`)).not.toHaveProperty("difficulty");
    // An untouched line is not sent.
    expect(bodyOf(server, "PATCH", `/encounters/${encounterId}`)).not.toHaveProperty("setting");
    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    expect(new URLSearchParams(globalThis.location.search).get("encounter")).toBe(encounterId);
  });

  it("clears the setting line with a null when the DM empties it", async () => {
    await openEdit();
    await userEvent.clear(screen.getByRole("textbox", { name: "Location" }));
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/encounters/${encounterId}`)).toMatchObject({
        setting: null,
      }),
    );
  });

  it("opens on the prep already written, and sends it whole with its kind", async () => {
    await openEdit();
    expect(screen.getByRole("textbox", { name: "Running it" })).toHaveValue(
      "Archers open from the reeds with full cover.\nAt half strength they grab a crate and run for the water.",
    );
    expect(screen.getByRole("textbox", { name: "Treasure" })).toHaveValue(
      "28 sp and a bone whistle",
    );
    expect(
      within(screen.getByRole("group", { name: "Type" })).getByRole("button", { name: "Combat" }),
    ).toHaveAttribute("aria-pressed", "true");

    const tactics = screen.getByRole("textbox", { name: "Running it" });
    await userEvent.clear(tactics);
    await userEvent.type(tactics, "Archers open from the reeds with full cover.");
    await userEvent.clear(screen.getByRole("textbox", { name: "Treasure" }));
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/encounters/${encounterId}`)).toMatchObject({
        kind: "combat",
        ready: false,
        tactics: ["Archers open from the reeds with full cover."],
        treasure: null,
        challenge: null,
      }),
    );
  });

  it("reads Ready back from the prep, and sends the DM's change of mind", async () => {
    server.routes.set(`GET ${encountersPath}/${encounterId}/prep`, {
      status: 200,
      body: { ...encounterPrep, ready: true },
    });
    await openEdit();
    const ready = screen.getByRole("switch", { name: "Ready to run" });
    expect(ready).toBeChecked();
    await userEvent.click(ready);
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/encounters/${encounterId}`)).toMatchObject({
        ready: false,
      }),
    );
  });

  it("drops a roster line by deleting the row, not by forgetting it", async () => {
    server.routes.set(`DELETE ${encountersPath}/${encounterId}/creatures/${rosterRowId}`, {
      status: 204,
      body: null,
    });
    await openEdit();
    await userEvent.click(screen.getByRole("button", { name: "Remove Goblin Boss" }));
    await save();

    await waitFor(() =>
      expect(
        server.calls.some(
          (call) => call.method === "DELETE" && call.pathname.endsWith(`/creatures/${rosterRowId}`),
        ),
      ).toBe(true),
    );
  });

  it("changes a count through the stepper, as one update of the row", async () => {
    server.routes.set(`PATCH ${encountersPath}/${encounterId}/creatures/${rosterRowId}`, {
      status: 200,
      body: {},
    });
    await openEdit();
    await userEvent.click(screen.getByRole("button", { name: "One fewer Goblin Boss" }));
    expect(screen.getByLabelText("How many Goblin Boss")).toHaveTextContent("5");
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/creatures/${rosterRowId}`)).toEqual({ count: 5 }),
    );
  });

  it("keeps the creatures in view when the type switches to one that takes none", async () => {
    await openEdit();
    await kind("Hazard");

    // The roster is still the encounter's, so it is still on the page, where the
    // DM can take a line off by hand; the save deletes nothing.
    const creatures = screen.getByRole("region", { name: /^Creatures/ });
    expect(within(creatures).getByText("Goblin Boss")).toBeInTheDocument();
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/encounters/${encounterId}`)).toMatchObject({
        kind: "hazard",
        challenge: null,
      }),
    );
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("says so when the encounter is not among the table's any more", async () => {
    // Its reads answer, but the list no longer has it: deleted from another tab.
    const gone = "2b1f2a1e-0000-4000-8000-0000000009ff";
    for (const read of ["creatures", "map", "prep"]) {
      const same = server.routes.get(`GET ${encountersPath}/${encounterId}/${read}`);
      if (same !== undefined) server.routes.set(`GET ${encountersPath}/${gone}/${read}`, same);
    }
    await renderAt(`${encountersPath}/${gone}/edit`);
    expect(await screen.findByText("No such encounter")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save encounter" })).toBeNull();
  });
});

describe("the read-aloud box", () => {
  const notesPath = `/campaigns/${campaignId}/notes`;
  const box = () => screen.getByRole("textbox", { name: "Read aloud" });
  const noteWrites = () => writes().filter((call) => call.pathname.startsWith(notesPath));
  const orderOf = () => writes().map((call) => `${call.method} ${call.pathname}`);

  beforeEach(() => {
    server.routes.set(`PATCH ${encountersPath}/${encounterId}`, { status: 200, body: encounter });
    server.routes.set(`PATCH ${notesPath}/${noteId}`, { status: 200, body: readAloud });
  });

  it("writes no note for a new encounter when it is left empty", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Quiet one"));
    await userEvent.type(await openNew(), "Quiet one");
    expect(box()).toHaveValue("");
    await save();

    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    expect(noteWrites()).toEqual([]);
  });

  it("makes a read-aloud note on a new encounter once the encounter exists", async () => {
    server.routes.set(`POST ${encountersPath}`, created("The dry well"));
    server.routes.set(`POST ${notesPath}`, { status: 200, body: readAloud });
    await userEvent.type(await openNew(), "The dry well");
    await userEvent.type(box(), "  The well is dry, and something below it is breathing. ");
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "POST", "/notes")).toEqual({
        // A note's title is required: the encounter's name is what Notes calls it.
        title: "The dry well",
        body: "The well is dry, and something below it is breathing.",
        kind: "read_aloud",
        attachedTo: { kind: "encounter", id: encounterId },
      }),
    );
    // The encounter first: the note is attached to it by the id its create returned.
    expect(orderOf()).toEqual([`POST ${encountersPath}`, `POST ${notesPath}`]);
    // Nothing about the read-aloud rides on the encounter's own create.
    expect(bodyOf(server, "POST", "/encounters")).not.toHaveProperty("readAloud");
    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
  });

  it("writes only the note on a second Save, when the note was refused after the encounter was made", async () => {
    server.routes.set(`POST ${encountersPath}`, created("The dry well"));
    // No route for the note's POST yet: the stub refuses it.
    await userEvent.type(await openNew(), "The dry well");
    await userEvent.type(box(), "The well is dry.");
    await save();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(globalThis.location.pathname).toBe(newPath);

    server.routes.set(`POST ${notesPath}`, { status: 200, body: readAloud });
    await save();

    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    // One encounter, not two.
    expect(orderOf()).toEqual([`POST ${encountersPath}`, `POST ${notesPath}`, `POST ${notesPath}`]);
  });

  it("opens on the encounter's read-aloud and writes nothing to it untouched", async () => {
    await openEdit();
    expect(box()).toHaveValue(readAloud.body);
    await save();

    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    expect(noteWrites()).toEqual([]);
  });

  it("updates the note's body when the DM changes it", async () => {
    await openEdit();
    await userEvent.clear(box());
    await userEvent.type(box(), "The reeds part.");
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/notes/${noteId}`)).toEqual({ body: "The reeds part." }),
    );
    expect(noteWrites()).toHaveLength(1);
  });

  it("detaches the note when the box is emptied, and deletes nothing", async () => {
    await openEdit();
    await userEvent.clear(box());
    await save();

    await waitFor(() =>
      expect(bodyOf(server, "PATCH", `/notes/${noteId}`)).toEqual({ attachedTo: null }),
    );
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("edits the oldest of several, and lists the others read-only with a way to Notes", async () => {
    const later = {
      ...readAloud,
      id: "2b1f2a1e-0000-4000-8000-000000000802",
      title: "When the boss falls",
      body: "The goblins scatter into the water.",
      createdAt: "2026-08-05T10:00:00.000Z",
      updatedAt: "2026-08-05T10:00:00.000Z",
    };
    // Newest first on the wire: which one the box edits is decided by age, not order.
    server.routes.set(`GET ${notesPath}`, { status: 200, body: page([later, readAloud]) });
    await openEdit();

    expect(box()).toHaveValue(readAloud.body);
    const others = screen.getByRole("region", { name: "Also read aloud" });
    expect(within(others).getByText(later.title)).toBeInTheDocument();
    expect(within(others).getByText(later.body)).toBeInTheDocument();
    expect(within(others).queryByRole("textbox")).toBeNull();
    expect(within(others).getByRole("link", { name: "Edit in Notes" })).toHaveAttribute(
      "href",
      notesPath,
    );

    await userEvent.clear(box());
    await userEvent.type(box(), "The reeds part.");
    await save();
    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    // Only the one the box edits was written.
    expect(noteWrites().map((call) => call.pathname)).toEqual([`${notesPath}/${noteId}`]);
  });

  it("re-reads the notes, so the preview and the Overview read the new words", async () => {
    await openEdit();
    await userEvent.clear(box());
    await userEvent.type(box(), "The reeds part.");
    const mark = server.calls.length;
    server.routes.set(`GET ${notesPath}`, {
      status: 200,
      body: page([{ ...readAloud, body: "The reeds part." }]),
    });
    await save();

    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    const preview = await screen.findByRole("region", { name: "Read aloud" });
    expect(preview).toHaveTextContent("The reeds part.");
    expect(
      server.calls.slice(mark).some((call) => call.method === "GET" && call.pathname === notesPath),
    ).toBe(true);

    await userEvent.click(
      within(screen.getByRole("navigation", { name: "This campaign" })).getByRole("link", {
        name: "Overview",
      }),
    );
    expect(await screen.findByText("Opening read-aloud")).toBeInTheDocument();
    expect(screen.getByText("The reeds part.")).toBeInTheDocument();
    expect(screen.queryByText(readAloud.body)).toBeNull();
  });
});

describe("leaving the builder", () => {
  it("writes nothing on Cancel, and goes back to the list", async () => {
    await openNew();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("goes back to the encounter it was editing", async () => {
    await openEdit();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "href",
      `${encountersPath}?encounter=${encounterId}`,
    );
  });

  it("asks before throwing away what was typed", async () => {
    await userEvent.type(await openNew(), "Half a thought");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const asked = await screen.findByRole("dialog", { name: /Leave without saving/ });
    await userEvent.click(within(asked).getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(globalThis.location.pathname).toBe(newPath);
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Half a thought");

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(
      within(await screen.findByRole("dialog", { name: /Leave without saving/ })).getByRole(
        "button",
        { name: "Discard changes" },
      ),
    );
    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    expect(writes()).toEqual([]);
  });

  it("does not ask after a save has landed", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Saved"));
    await userEvent.type(await openNew(), "Saved");
    await save();

    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("who may write one", () => {
  it("refuses a player at the new-encounter URL, before drawing a form", async () => {
    server.routes.set("GET /me/campaigns", {
      status: 200,
      body: [{ campaign, relation: "player", sharedWorld: null, joinedAt: campaign.createdAt }],
    });
    // Prep is the creator's alone, so the page's one creator read refuses.
    server.routes.set(`GET /campaigns/${campaignId}/encounter-prep`, {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    });
    await renderAt(newPath);

    expect(await screen.findByText("The DM's side of the screen")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save encounter" })).toBeNull();
  });
});

describe("the rail", () => {
  const creatureReads = () =>
    server.calls.filter(
      (call) => call.method === "GET" && call.pathname === `/campaigns/${campaignId}/creatures`,
    );

  it("narrows the bestiary by CR band on the server, weakest first", async () => {
    await openNew();
    await screen.findByRole("button", { name: "Add Goblin Boss" });
    const first = new URLSearchParams(creatureReads().at(-1)!.search);
    expect(first.get("sort")).toBe("cr");
    expect(first.has("crMin")).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "CR 2–4" }));
    await waitFor(() => {
      const query = new URLSearchParams(creatureReads().at(-1)!.search);
      expect([query.get("crMin"), query.get("crMax"), query.get("sort")]).toEqual(["2", "4", "cr"]);
    });
    expect(screen.getByRole("button", { name: "CR 2–4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Any CR" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "CR 1 and under" }));
    await waitFor(() => {
      const query = new URLSearchParams(creatureReads().at(-1)!.search);
      expect([query.get("crMin"), query.get("crMax")]).toEqual([null, "1"]);
    });
  });

  it("adds a creature already on the roster as one more, and sends one line", async () => {
    server.routes.set(`POST ${encountersPath}`, created("Two bosses"));
    await userEvent.type(await openNew(), "Two bosses");
    const add = await screen.findByRole("button", { name: "Add Goblin Boss" });
    expect(screen.getByText("Humanoid · 200 xp")).toBeInTheDocument();

    await userEvent.click(add);
    await userEvent.click(add);
    expect(
      screen.getAllByRole("listitem").filter((row) => row.dataset.slot === "roster-line"),
    ).toHaveLength(1);
    expect(screen.getByLabelText("How many Goblin Boss")).toHaveTextContent("2");
    // The bestiary row says how many are on it.
    expect(screen.getByLabelText("2 on the roster")).toHaveTextContent("×2");

    await save();
    await waitFor(() =>
      expect(bodyOf(server, "POST", "/encounters")).toMatchObject({
        creatures: [{ creatureId: goblinId, count: 2 }],
      }),
    );
  });

  it("rates the draft as it is written, against the seated party", async () => {
    await openNew();
    const card = screen.getByRole("region", { name: "Difficulty" });
    // Brannoc alone, at level 3: the party's own thresholds, before any creature.
    expect(within(card).getByText("Unrated")).toBeInTheDocument();
    expect(
      within(card).getByText(
        "No creatures to rate yet. Add them from the bestiary and the band follows.",
      ),
    ).toBeInTheDocument();
    const tiers = within(card).getByRole("list", { name: "Thresholds" });
    expect(
      within(tiers)
        .getAllByRole("listitem")
        .map((tier) => tier.textContent),
    ).toEqual(["Easy75", "Medium150", "Hard225", "Deadly400"]);
    expect(within(card).getByText("party of 1, lvl 3")).toBeInTheDocument();

    // One Goblin Boss: 200 XP, ×1.5 against a party of one.
    await userEvent.click(await screen.findByRole("button", { name: "Add Goblin Boss" }));
    const band = () => card.querySelector("[data-slot=difficulty-band]");
    expect(band()).toHaveTextContent("Hard");
    expect(within(card).getByText("300 adj. XP")).toBeInTheDocument();
    expect(
      within(card).getByText("100 more adjusted XP tips this into deadly."),
    ).toBeInTheDocument();
    expect(within(card).getByText("×1.5 for group size")).toBeInTheDocument();
    expect(within(tiers).getByText("Hard").closest("li")).toHaveAttribute("aria-current", "true");

    // The stepper moves it: two is 400 XP at ×2.
    await userEvent.click(screen.getByRole("button", { name: "One more Goblin Boss" }));
    expect(band()).toHaveTextContent("Deadly");
    expect(within(card).getByText("800 adj. XP")).toBeInTheDocument();
  });

  it("says why there is no band when nobody seated has a level", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, { status: 200, body: [] });
    await openNew();
    await userEvent.click(await screen.findByRole("button", { name: "Add Goblin Boss" }));
    const card = screen.getByRole("region", { name: "Difficulty" });
    expect(within(card).getByText("Unrated")).toBeInTheDocument();
    expect(within(card).getByText(/^Nobody seated has a level/)).toBeInTheDocument();
    // No party, so no tiers to draw and no numbers claimed for one.
    expect(within(card).queryByRole("list", { name: "Thresholds" })).toBeNull();
    expect(within(card).queryByText(/adj\. XP/)).toBeNull();
  });

  it("shows a challenge the SRD's typical DCs instead of a bestiary", async () => {
    await openNew();
    await kind("Challenge");
    const guide = screen.getByRole("region", { name: "Setting the DC" });
    expect(within(guide).getByText("Nearly impossible")).toBeInTheDocument();
    expect(within(guide).getByText("15")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Difficulty" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Bestiary" })).toBeNull();
  });
});
