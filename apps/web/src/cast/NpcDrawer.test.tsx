import { UNNAMED_NPC } from "@taverns/api";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import {
  blankPrep,
  campaignId,
  cazril,
  encounter,
  installStubServer,
  noteId,
  npcId,
  page,
  readAloud,
  seatId,
  sessionId,
  sketch,
  sketchId,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";
import { AUTOSAVE_DELAY_MS } from "../ui/autosave";

/**
 * The NPC drawer over the stub wire: how it opens and closes, what each edit
 * sends and when — the DM's prep to its own endpoint — and where it leads. The saver's pure half — which lines a
 * change rebuilds, and the role held for a settled save — is
 * `npcAutosave.test.ts`.
 */

const server = installStubServer();
const npcPath = `/campaigns/${campaignId}/npcs/${npcId}`;

/** The PATCH answers the row a version on, as the server does. */
let version = cazril.version;

beforeEach(() => {
  server.reset();
  version = cazril.version;
  server.routes.set(`PATCH ${npcPath}`, {
    status: 200,
    body: () => ({ ...cazril, version: ++version }),
  });
});

afterEach(() => cleanup());

const render = (search: string) =>
  renderAt(`/campaigns/${campaignId}/cast${search}`, (screen) => (
    <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
  ));

/** The Cast with Cazril's drawer open, by the address. */
const open = async () => {
  await render(`?npc=${npcId}`);
  return screen.findByRole("dialog", { name: "Cazril" });
};

const patches = () =>
  server.calls
    .filter((call) => call.method === "PATCH" && call.pathname === npcPath)
    .map((call) => JSON.parse(call.body) as Record<string, unknown>);

const prepPatches = () =>
  server.calls
    .filter((call) => call.method === "PATCH" && call.pathname === `${npcPath}/prep`)
    .map((call) => JSON.parse(call.body) as Record<string, unknown>);

const chosen = () => new URLSearchParams(globalThis.location.search).get("npc");

describe("the NPC drawer", () => {
  it("opens from anywhere on the card, and closes by Esc and by Done", async () => {
    await render("");
    await userEvent.click(await screen.findByRole("link", { name: "Cazril" }));

    const drawer = await screen.findByRole("dialog", { name: "Cazril" });
    expect(chosen()).toBe(npcId);
    // What it edits, as drawn, filled from the row.
    expect(within(drawer).getByRole("textbox", { name: "Name" })).toHaveValue("Cazril");
    expect(within(drawer).getByRole("textbox", { name: "Role" })).toHaveValue(
      "the ferryman at the crossing",
    );
    expect(within(drawer).getByRole("textbox", { name: "Voice and manner" })).toHaveValue(
      cazril.persona.voice.manner,
    );
    expect(within(drawer).getByRole("textbox", { name: "What they want" })).toHaveValue("");
    expect(within(drawer).getByRole("textbox", { name: "Secret" })).toHaveValue(
      cazril.privateMaterial.secrets,
    );
    expect(within(drawer).getByText("DM only")).toBeInTheDocument();
    expect(within(drawer).getByRole("switch", { name: "Players can see this" })).not.toBeChecked();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chosen()).toBeNull();

    await userEvent.click(screen.getByRole("link", { name: "Cazril" }));
    const again = await screen.findByRole("dialog", { name: "Cazril" });
    await userEvent.click(within(again).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chosen()).toBeNull();
    // Opening and closing is not an edit.
    expect(patches()).toEqual([]);
  });

  it("saves the manner once typing stops, keeping every other line of the persona", async () => {
    const drawer = await open();
    await userEvent.type(
      within(drawer).getByRole("textbox", { name: "What they want" }),
      "To be left alone with the river.",
    );
    expect(patches()).toEqual([]);
    expect(within(drawer).getByText("Saving…")).toBeInTheDocument();

    await waitFor(() => expect(patches()).toHaveLength(1), { timeout: AUTOSAVE_DELAY_MS * 3 });
    // The persona is replaced whole, so it is rebuilt from the whole row: the
    // pronouns, the phrases and the boundaries written on the NPC's page stay.
    expect(patches()[0]).toEqual({
      expectedVersion: cazril.version,
      persona: {
        ...cazril.persona,
        intent: { wants: "To be left alone with the river." },
      },
    });
    await waitFor(() => expect(within(drawer).getByText("Saved")).toBeInTheDocument());
  });

  it("sends the secret only in the private material", async () => {
    const drawer = await open();
    const secret = within(drawer).getByRole("textbox", { name: "Secret" });
    await userEvent.clear(secret);
    await userEvent.type(secret, "He sold the crossing to the hag.");
    await userEvent.tab();

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({
      expectedVersion: cazril.version,
      privateMaterial: { secrets: "He sold the crossing to the hag." },
    });
  });

  it("holds the role until the field is left, so a portrait is never drawn from half a word", async () => {
    const drawer = await open();
    const role = within(drawer).getByRole("textbox", { name: "Role" });
    await userEvent.clear(role);
    await userEvent.type(role, "The hag's ferryman");

    // Well past the pause: nothing, because the role waits to be settled.
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS * 1.5));
    expect(patches()).toEqual([]);

    await userEvent.tab();
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({ expectedVersion: cazril.version, role: "The hag's ferryman" });
  });

  it("sends the role typed when the drawer closes", async () => {
    const drawer = await open();
    const role = within(drawer).getByRole("textbox", { name: "Role" });
    await userEvent.clear(role);
    await userEvent.type(role, "Ferryman");
    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(patches()).toEqual([{ expectedVersion: 2, role: "Ferryman" }]));
  });

  it("builds each save on the version the last one answered", async () => {
    const drawer = await open();
    await userEvent.type(within(drawer).getByRole("textbox", { name: "Name" }), " the Elder");
    await userEvent.tab();
    await waitFor(() => expect(patches()).toHaveLength(1));
    await waitFor(() => expect(within(drawer).getByText("Saved")).toBeInTheDocument());
    await userEvent.click(within(drawer).getByRole("switch", { name: "Players can see this" }));

    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()).toEqual([
      { expectedVersion: cazril.version, name: "Cazril the Elder" },
      // A switch is saved at once.
      { expectedVersion: cazril.version + 1, visibility: "shared" },
    ]);
  });

  it("keeps the last name while the field is empty, and says so", async () => {
    const drawer = await open();
    await userEvent.clear(within(drawer).getByRole("textbox", { name: "Name" }));
    await userEvent.tab();

    expect(within(drawer).getByRole("alert")).toHaveTextContent(
      "An NPC needs a name. Until they have one, they keep “Cazril”.",
    );
    expect(screen.getByRole("dialog", { name: "Cazril" })).toBeInTheDocument();
    expect(patches()).toEqual([]);
  });

  it("names a blank NPC the moment one is typed", async () => {
    const blank = { ...cazril, name: UNNAMED_NPC, role: "", persona: {}, privateMaterial: {} };
    server.routes.set(`GET /campaigns/${campaignId}/npcs`, { status: 200, body: [blank] });
    await render(`?npc=${npcId}`);
    const drawer = await screen.findByRole("dialog", { name: UNNAMED_NPC });
    await userEvent.type(within(drawer).getByRole("textbox", { name: "Name" }), "Fen");
    await userEvent.tab();

    await waitFor(() => expect(patches()).toEqual([{ expectedVersion: 2, name: "Fen" }]));
    expect(within(drawer).getByRole("heading", { name: "Fen" })).toBeInTheDocument();
  });

  it("offers a reload when the NPC was changed elsewhere, and starts over from it", async () => {
    server.routes.set(`PATCH ${npcPath}`, {
      status: 409,
      body: { _tag: "Conflict", message: "Someone else changed this NPC. Reload it first." },
    });
    server.routes.set(`GET ${npcPath}`, {
      status: 200,
      body: { ...cazril, version: 7, role: "the hag's ferryman" },
    });
    const drawer = await open();
    await userEvent.type(within(drawer).getByRole("textbox", { name: "Voice and manner" }), "!");
    await userEvent.tab();

    expect(await within(drawer).findByRole("alert")).toHaveTextContent(
      "Someone else changed this NPC. Reload it first.",
    );
    // Retrying cannot mend it, so a blur or a keystroke sends nothing more.
    await userEvent.type(within(drawer).getByRole("textbox", { name: "What they want" }), "x");
    await userEvent.tab();
    expect(patches()).toHaveLength(1);
    await userEvent.click(within(drawer).getByRole("button", { name: "Reload" }));

    // A new drawer, over the row read again: what it now holds, and no failure.
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Role" })).toHaveValue("the hag's ferryman"),
    );
    expect(screen.getByRole("textbox", { name: "Voice and manner" })).toHaveValue(
      cazril.persona.voice.manner,
    );
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  });

  it("saves the prep to its own endpoint: a toggle at once, and pressing the lit one clears it", async () => {
    const drawer = await open();
    const toward = within(drawer).getByRole("group", { name: "Toward the party" });
    const status = within(drawer).getByRole("group", { name: "Status" });
    // Nothing set is nothing lit, never a default.
    for (const toggle of [
      ...within(toward).getAllByRole("button"),
      ...within(status).getAllByRole("button"),
    ])
      expect(toggle).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(within(toward).getByRole("button", { name: "Hostile" }));
    await waitFor(() => expect(prepPatches()).toEqual([{ attitude: "hostile" }]));
    await userEvent.click(within(status).getByRole("button", { name: "Dead" }));
    await waitFor(() => expect(prepPatches()).toHaveLength(2));
    await userEvent.click(within(toward).getByRole("button", { name: "Hostile" }));
    await waitFor(() => expect(prepPatches()).toHaveLength(3));
    expect(prepPatches()).toEqual([
      { attitude: "hostile" },
      { status: "dead" },
      { attitude: null },
    ]);
    expect(within(toward).getByRole("button", { name: "Hostile" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // The prep is not the row's: nothing went to the NPC itself.
    expect(patches()).toEqual([]);
  });

  it("saves where on the pause, trimmed, and an emptied one as cleared", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/prep`, {
      status: 200,
      body: [{ ...blankPrep(npcId), whereabouts: "The crossing" }],
    });
    const drawer = await open();
    const where = within(drawer).getByRole("textbox", { name: "Where" });
    expect(where).toHaveValue("The crossing");
    await userEvent.clear(where);
    await userEvent.tab();
    await waitFor(() => expect(prepPatches()).toEqual([{ whereabouts: null }]));

    await userEvent.type(where, "Under the ford ");
    await waitFor(() => expect(prepPatches()).toHaveLength(2), {
      timeout: AUTOSAVE_DELAY_MS * 3,
    });
    expect(prepPatches()[1]).toEqual({ whereabouts: "Under the ford" });
  });

  it("picks the night the party first met them, or Not met yet", async () => {
    const drawer = await open();
    const said = () => drawer.querySelector('[data-slot="sheet-description"]');
    expect(said()).toHaveTextContent("Not met yet");
    const met = within(drawer).getByRole("combobox", { name: "First met" });
    expect(met).toHaveTextContent("Not met yet");

    await userEvent.click(met);
    await userEvent.click(await screen.findByRole("option", { name: "Session 12" }));
    await waitFor(() => expect(prepPatches()).toEqual([{ metSessionId: sessionId }]));
    // The header says so as it changes.
    expect(said()).toHaveTextContent("First met in session 12");

    await userEvent.click(within(drawer).getByRole("combobox", { name: "First met" }));
    await userEvent.click(await screen.findByRole("option", { name: "Not met yet" }));
    await waitFor(() => expect(prepPatches()).toHaveLength(2));
    expect(prepPatches()[1]).toEqual({ metSessionId: null });
    expect(said()).toHaveTextContent("Not met yet");
  });

  it("leads to the NPC's rehearsal and to the cast's follow-up", async () => {
    const drawer = await open();

    expect(within(drawer).getByRole("button", { name: "Rehearse" })).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/cast/${npcId}#rehearsal`,
    );
    expect(within(drawer).getByRole("button", { name: "NPC follow-up" })).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/cast/follow-up`,
    );
    // One peach on the screen, and it is the campaign row's: the drawer's
    // presses are all quieter.
    for (const button of within(drawer).getAllByRole("button"))
      expect(button).not.toHaveClass("bg-accent");
  });
});

describe("Tied to and Shows up in", () => {
  const linksPath = `${npcPath}/links`;
  const notesPath = `/campaigns/${campaignId}/notes`;
  /** What the NPC is linked to, as the stub server holds it. */
  let links: Array<{ readonly kind: string; readonly id: string }> = [];

  beforeEach(() => {
    links = [];
    server.routes.set(`GET ${linksPath}`, { status: 200, body: () => ({ npcId, links }) });
  });

  const sent = (method: string, pathname: string) =>
    server.calls
      .filter((call) => call.method === method && call.pathname === pathname)
      .map((call) => (call.body === "" ? null : (JSON.parse(call.body) as unknown)));

  it("ties the NPC to a seat with its toggle, and unties it again", async () => {
    server.routes.set(`POST ${linksPath}`, {
      status: 200,
      body: () => {
        links = [{ kind: "seat", id: seatId }];
        return { npcId, links };
      },
    });
    server.routes.set(`DELETE ${linksPath}/seat/${seatId}`, {
      status: 200,
      body: () => {
        links = [];
        return { npcId, links };
      },
    });
    const drawer = await open();
    const ties = await within(drawer).findByRole("group", { name: "Tied to" });
    const brannoc = within(ties).getByRole("button", { name: "Brannoc" });
    // Nobody is tied until the DM says so.
    expect(brannoc).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(brannoc);
    await waitFor(() => expect(sent("POST", linksPath)).toEqual([{ kind: "seat", id: seatId }]));
    // The links are read again, and the toggle is lit from what they answer.
    await waitFor(() =>
      expect(within(ties).getByRole("button", { name: "Brannoc" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );

    await userEvent.click(within(ties).getByRole("button", { name: "Brannoc" }));
    await waitFor(() => expect(sent("DELETE", `${linksPath}/seat/${seatId}`)).toHaveLength(1));
    await waitFor(() =>
      expect(within(ties).getByRole("button", { name: "Brannoc" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    // A tie is not an edit of the NPC.
    expect(patches()).toEqual([]);
    expect(prepPatches()).toEqual([]);
  });

  it("shows the nights at the table, the linked encounters and the notes naming them, each opening its own", async () => {
    links = [{ kind: "encounter", id: sketchId }];
    server.routes.set(`GET /campaigns/${campaignId}/npcs/-/prep`, {
      status: 200,
      body: [{ ...blankPrep(npcId), tableNights: [sessionId] }],
    });
    server.routes.set(`GET ${notesPath}`, {
      status: 200,
      body: page([{ ...readAloud, links: [{ kind: "npc", id: npcId }] }]),
    });
    const drawer = await open();
    const appears = await within(drawer).findByRole("list", { name: "Shows up in" });

    // A night is derived from the table chats: it opens the Chronicle, and has no ×.
    expect(within(appears).getByRole("link", { name: "Session 12" })).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/chronicle?session=${sessionId}`,
    );
    expect(within(appears).queryByRole("button", { name: "Unlink Session 12" })).toBeNull();
    expect(within(appears).getByRole("link", { name: sketch.name })).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/encounters?encounter=${sketchId}`,
    );
    expect(within(appears).getByRole("link", { name: readAloud.title })).toHaveAttribute(
      "href",
      `/campaigns/${campaignId}/notes?note=${noteId}`,
    );
    // Drawn in that order: nights, encounters, notes, then the menu.
    expect(
      within(appears)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Session 12", sketch.name, readAloud.title, "Link…"]);
    expect(within(drawer).queryByText(/^Not at the table/)).toBeNull();
  });

  it("unlinks an encounter from the NPC, and a note from its own links", async () => {
    links = [{ kind: "encounter", id: sketchId }];
    server.routes.set(`GET ${notesPath}`, {
      status: 200,
      body: page([{ ...readAloud, links: [{ kind: "npc", id: npcId }] }]),
    });
    server.routes.set(`DELETE ${linksPath}/encounter/${sketchId}`, {
      status: 200,
      body: { npcId, links: [] },
    });
    server.routes.set(`DELETE ${notesPath}/${noteId}/links/npc/${npcId}`, {
      status: 200,
      body: readAloud,
    });
    const drawer = await open();

    await userEvent.click(
      await within(drawer).findByRole("button", { name: `Unlink ${sketch.name}` }),
    );
    await waitFor(() =>
      expect(sent("DELETE", `${linksPath}/encounter/${sketchId}`)).toHaveLength(1),
    );
    await userEvent.click(
      within(drawer).getByRole("button", { name: `Unlink ${readAloud.title}` }),
    );
    await waitFor(() =>
      expect(sent("DELETE", `${notesPath}/${noteId}/links/npc/${npcId}`)).toHaveLength(1),
    );
    // Neither leaves the drawer.
    expect(screen.getByRole("dialog", { name: "Cazril" })).toBeInTheDocument();
    expect(patches()).toEqual([]);
  });

  it("links an encounter to the NPC, or the NPC to a note, from the menu", async () => {
    server.routes.set(`POST ${linksPath}`, {
      status: 200,
      body: { npcId, links: [{ kind: "encounter", id: sketchId }] },
    });
    server.routes.set(`POST ${notesPath}/${noteId}/links`, {
      status: 200,
      body: { ...readAloud, links: [{ kind: "npc", id: npcId }] },
    });
    const drawer = await open();
    // Nothing yet, and it says so.
    expect(
      await within(drawer).findByText("Not at the table, in an encounter or in a note yet."),
    ).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: "Link…" }));
    const items = await screen.findAllByRole("menuitem");
    // Every encounter and note, none linked yet.
    expect(items.map((item) => item.textContent)).toEqual([
      encounter.name,
      sketch.name,
      readAloud.title,
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: sketch.name }));
    await waitFor(() =>
      expect(sent("POST", linksPath)).toEqual([{ kind: "encounter", id: sketchId }]),
    );

    await userEvent.click(within(drawer).getByRole("button", { name: "Link…" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: readAloud.title }));
    await waitFor(() =>
      expect(sent("POST", `${notesPath}/${noteId}/links`)).toEqual([{ kind: "npc", id: npcId }]),
    );
    expect(patches()).toEqual([]);
  });

  it("says so when nobody is seated", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/party`, { status: 200, body: [] });
    const drawer = await open();
    expect(
      await within(drawer).findByText("Nobody is seated at this table yet."),
    ).toBeInTheDocument();
    expect(within(drawer).queryByRole("group", { name: "Tied to" })).toBeNull();
  });
});
