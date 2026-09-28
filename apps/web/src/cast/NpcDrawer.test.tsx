import { UNNAMED_NPC } from "@taverns/api";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HostedSessionScope } from "../auth/AuthProvider";
import { campaignId, cazril, installStubServer, npcId } from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";
import { TEST_SESSION } from "../test/session";
import { AUTOSAVE_DELAY_MS } from "../ui/autosave";

/**
 * The NPC drawer over the stub wire: how it opens and closes, what each edit
 * sends and when, and where it leads. The saver's pure half — which lines a
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
