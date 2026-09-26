import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import {
  blankNote,
  campaignId,
  grusk,
  houseRule,
  installStubServer,
  noteShelf,
  page,
  readAloud,
} from "./campaign.fixtures";
import { AUTOSAVE_DELAY_MS } from "./noteAutosave";

/**
 * The Notes tab as the redesign draws it: a list beside the note selected,
 * written in place and saved as the DM types. The saver's own timing —
 * the debounce and the one request in flight — is `noteAutosave.test.ts`;
 * this is the screen over the wire.
 */

const server = installStubServer();
const notesPath = `/campaigns/${campaignId}/notes`;
const newId = "2b1f2a1e-0000-4000-8000-000000000899";

beforeEach(() => {
  server.reset();
  server.routes.set(`GET ${notesPath}`, { status: 200, body: page(noteShelf) });
  for (const note of noteShelf)
    server.routes.set(`PATCH ${notesPath}/${note.id}`, { status: 200, body: note });
});

const open = async (search = "") => {
  await renderAt(`${notesPath}${search}`);
  return screen.findByRole("article");
};

const titles = () =>
  rows().map((row) => row.querySelector('[data-slot="note-row-title"]')?.textContent);
const rows = () =>
  within(document.querySelector<HTMLElement>('[data-slot="note-list"] ul')!).getAllByRole("button");
const rowFor = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}`) });
const chosen = () => new URLSearchParams(globalThis.location.search).get("note");
const patches = (id: string) =>
  server.calls
    .filter((call) => call.method === "PATCH" && call.pathname === `${notesPath}/${id}`)
    .map((call) => JSON.parse(call.body) as unknown);
const reads = () =>
  server.calls.filter((call) => call.method === "GET" && call.pathname === notesPath).length;

describe("the Notes list", () => {
  it("lists pinned first, then newest, marks pins and shared ones, and previews the first line", async () => {
    await open();

    expect(titles()).toEqual([
      "The salt flats",
      "House rule: flanking",
      "Grusk, the toll-keeper",
      "Read aloud at the water",
    ]);
    // Only the shared note is marked: the default is the DM's alone.
    expect(within(rowFor("House rule")).getByText("Shared")).toBeInTheDocument();
    expect(within(rowFor("Grusk")).queryByText("Shared")).toBeNull();
    expect(within(rowFor("The salt flats")).getByText("Pinned")).toBeInTheDocument();
    expect(within(rowFor("Grusk")).queryByText("Pinned")).toBeNull();
    // The first line, not the whole body.
    expect(rowFor("Grusk")).toHaveTextContent(/Owes the Salt Company more than he admits\./);
    expect(rowFor("Grusk")).not.toHaveTextContent(/in favours/);
    expect(rowFor("The salt flats")).toHaveTextContent("Empty note");
    // The category, the register when it is read aloud, and *Note* when neither.
    expect(rowFor("Read aloud at the water")).toHaveTextContent(/Read aloud · Edited /);
    expect(rowFor("Grusk")).toHaveTextContent(/NPC · Edited /);
    expect(rowFor("The salt flats")).toHaveTextContent(/Place · Edited /);
    expect(screen.getByText("4 notes · 1 pinned")).toBeInTheDocument();
  });

  it("puts the first row in the pane when nothing is chosen", async () => {
    const pane = await open();
    expect(pane).toHaveAccessibleName(blankNote.title);
    expect(rowFor("The salt flats")).toHaveAttribute("aria-current", "true");
    expect(chosen()).toBeNull();
  });

  it("writes the choice to the address and shows it, paragraphs and all", async () => {
    await open();
    await userEvent.click(rowFor("Grusk"));

    await waitFor(() => expect(chosen()).toBe(grusk.id));
    expect(screen.getByRole("article")).toHaveAccessibleName(grusk.title);
    expect(screen.getByRole("textbox", { name: "Body" })).toHaveValue(grusk.body);
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue(grusk.title);
  });

  it("opens on the note the address names, in the prose face when it is read aloud", async () => {
    await open(`?note=${readAloud.id}`);

    expect(screen.getByRole("article")).toHaveAccessibleName(readAloud.title);
    const prose = screen.getByRole("textbox", { name: "What you read out" });
    expect(prose).toHaveValue(readAloud.body);
    expect(prose).toHaveClass("font-serif", "italic", "text-body-l", "leading-loose");
    expect(screen.getByRole("button", { name: "Read aloud" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("gives way to the first note shown when the search hides the choice", async () => {
    await open(`?note=${readAloud.id}`);
    await userEvent.type(screen.getByRole("combobox", { name: "Search notes" }), "toll");

    await waitFor(() => expect(chosen()).toBeNull());
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole("article")).toHaveAccessibleName(grusk.title);
  });

  it("keeps the search and drops the pane when nothing matches", async () => {
    await open();
    await userEvent.type(screen.getByRole("combobox", { name: "Search notes" }), "zzzz");

    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Search notes" })).toBeInTheDocument();
  });

  it("filters by one category pill AND the search", async () => {
    await open(`?note=${readAloud.id}`);
    const pills = screen.getByRole("group", { name: "Filter by category" });
    expect(within(pills).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(within(pills).getByRole("button", { name: "NPCs" }));
    expect(titles()).toEqual(["Grusk, the toll-keeper"]);
    // The choice the pill hides gives way to the first note it shows.
    await waitFor(() => expect(chosen()).toBeNull());
    expect(screen.getByRole("article")).toHaveAccessibleName(grusk.title);
    expect(within(pills).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // The search narrows within the pill, never beyond it.
    await userEvent.type(screen.getByRole("combobox", { name: "Search notes" }), "flanking");
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument();

    await userEvent.click(within(pills).getByRole("button", { name: "Rules" }));
    expect(titles()).toEqual(["House rule: flanking"]);

    // The counts are of every note, not of what the filter shows.
    expect(screen.getByText("4 notes · 1 pinned")).toBeInTheDocument();
  });

  it("says so when there are no notes at all", async () => {
    server.routes.set(`GET ${notesPath}`, { status: 200, body: page([]) });
    await renderAt(notesPath);

    expect(await screen.findByText("No notes yet")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
  });
});

describe("writing a note in the pane", () => {
  it("saves the body once typing stops, sending only the body", async () => {
    await open(`?note=${grusk.id}`);
    const body = screen.getByRole("textbox", { name: "Body" });
    await userEvent.type(body, " Hates rain.");

    // Nothing on every keystroke.
    expect(patches(grusk.id)).toEqual([]);
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    await waitFor(() => expect(patches(grusk.id)).toHaveLength(1), {
      timeout: AUTOSAVE_DELAY_MS * 3,
    });
    expect(patches(grusk.id)[0]).toEqual({ body: `${grusk.body} Hates rain.` });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
  });

  it("saves at once when the field loses focus", async () => {
    const readsBefore = reads();
    await open(`?note=${grusk.id}`);
    const title = screen.getByRole("textbox", { name: "Title" });
    await userEvent.clear(title);
    await userEvent.type(title, "Grusk");
    await userEvent.tab();

    await waitFor(() => expect(patches(grusk.id)).toEqual([{ title: "Grusk" }]));
    // The list re-reads, so the row says what was saved.
    await waitFor(() => expect(reads()).toBeGreaterThan(readsBefore + 1));
  });

  it("saves what was typed before another note is chosen", async () => {
    await open(`?note=${grusk.id}`);
    await userEvent.type(screen.getByRole("textbox", { name: "Body" }), " More.");
    await userEvent.click(rowFor("House rule"));

    await waitFor(() => expect(patches(grusk.id)).toEqual([{ body: `${grusk.body} More.` }]));
    expect(screen.getByRole("article")).toHaveAccessibleName(houseRule.title);

    // Coming back finds the draft, not the list's older copy.
    await userEvent.click(rowFor("Grusk"));
    expect(screen.getByRole("textbox", { name: "Body" })).toHaveValue(`${grusk.body} More.`);
  });

  it("holds an emptied title back, saves the rest, and says a title is needed", async () => {
    await open(`?note=${grusk.id}`);
    const title = screen.getByRole("textbox", { name: "Title" });
    await userEvent.clear(title);
    await userEvent.type(screen.getByRole("textbox", { name: "Body" }), " Still here.");
    await userEvent.tab();

    await waitFor(() => expect(patches(grusk.id)).toEqual([{ body: `${grusk.body} Still here.` }]));
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(
      `A note needs a title. Until it has one, it keeps “${grusk.title}”.`,
    );

    await userEvent.type(title, "Grusk again");
    await userEvent.tab();
    await waitFor(() => expect(patches(grusk.id)).toContainEqual({ title: "Grusk again" }));
    expect(title).not.toHaveAttribute("aria-invalid", "true");
  });

  it("saves the register, the attachment and who can see it at once", async () => {
    await open(`?note=${readAloud.id}`);

    await userEvent.click(screen.getByRole("button", { name: "Note" }));
    await waitFor(() => expect(patches(readAloud.id)).toEqual([{ kind: "note" }]));
    // The body is now in the interface face, under its plain name.
    expect(screen.getByRole("textbox", { name: "Body" })).not.toHaveClass("font-serif");

    await userEvent.click(screen.getByRole("combobox", { name: "Attached to" }));
    await userEvent.click(await screen.findByRole("option", { name: "Nothing" }));
    await waitFor(() => expect(patches(readAloud.id)).toContainEqual({ attachedTo: null }));

    await userEvent.click(screen.getByRole("switch", { name: "Players can see this" }));
    await waitFor(() => expect(patches(readAloud.id)).toContainEqual({ visibility: "shared" }));
    expect(patches(readAloud.id)).toHaveLength(3);
  });

  it("saves a category through the same autosave, and pressing it again clears it", async () => {
    await open(`?note=${grusk.id}`);
    const toggles = screen.getByRole("group", { name: "Category" });
    expect(within(toggles).getByRole("button", { name: "NPC" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(within(toggles).getByRole("button", { name: "Lore" }));
    await waitFor(() => expect(patches(grusk.id)).toEqual([{ category: "lore" }]));
    expect(within(toggles).getByRole("button", { name: "NPC" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("article")).toHaveTextContent(/Lore\s*·\s*Edited /);

    // No category is a real state: the lit one, pressed, clears to `null`.
    await userEvent.click(within(toggles).getByRole("button", { name: "Lore" }));
    await waitFor(() => expect(patches(grusk.id)).toContainEqual({ category: null }));
    for (const toggle of within(toggles).getAllByRole("button"))
      expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("says when a save fails, and tries again on Retry", async () => {
    server.routes.set(`PATCH ${notesPath}/${grusk.id}`, {
      status: 500,
      body: { _tag: "InternalError" },
    });
    await open(`?note=${grusk.id}`);
    await userEvent.type(screen.getByRole("textbox", { name: "Body" }), "!");
    await userEvent.tab();

    expect(await screen.findByText("Couldn’t save")).toBeInTheDocument();

    server.routes.set(`PATCH ${notesPath}/${grusk.id}`, { status: 200, body: grusk });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    expect(patches(grusk.id)).toEqual([{ body: `${grusk.body}!` }, { body: `${grusk.body}!` }]);
  });
});

describe("pinning a note", () => {
  const pinPath = (id: string) => `${notesPath}/${id}/pin`;
  const pinCalls = () => server.calls.filter((call) => call.pathname.endsWith("/pin"));

  it("sends the pin endpoint, not a PATCH, and the row leads the list at once", async () => {
    const pinned = { ...grusk, pinnedAt: "2026-08-11T09:00:00.000Z" };
    server.routes.set(`PUT ${pinPath(grusk.id)}`, { status: 200, body: pinned });
    await open(`?note=${grusk.id}`);
    const pin = screen.getByRole("button", { name: "Pin note" });
    expect(pin).toHaveAttribute("aria-pressed", "false");

    // The list's own read now says what the server says.
    server.routes.set(`GET ${notesPath}`, {
      status: 200,
      body: page(noteShelf.map((note) => (note.id === grusk.id ? pinned : note))),
    });
    await userEvent.click(pin);

    // Pinned notes lead, newest first among them.
    expect(titles().slice(0, 2)).toEqual(["Grusk, the toll-keeper", "The salt flats"]);
    await waitFor(() =>
      expect(pinCalls().map((call) => `${call.method} ${call.pathname}`)).toEqual([
        `PUT ${pinPath(grusk.id)}`,
      ]),
    );
    expect(patches(grusk.id)).toEqual([]);
    await waitFor(() => expect(screen.getByText("4 notes · 2 pinned")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Pin note" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(rowFor("Grusk")).getByText("Pinned")).toBeInTheDocument();
  });

  it("unpins through its reverse, and a refused press puts the row back", async () => {
    server.routes.set(`DELETE ${pinPath(blankNote.id)}`, {
      status: 500,
      body: { _tag: "InternalError" },
    });
    await open(`?note=${blankNote.id}`);
    const pin = screen.getByRole("button", { name: "Pin note" });
    expect(pin).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(pin);
    await waitFor(() =>
      expect(pinCalls().map((call) => `${call.method} ${call.pathname}`)).toEqual([
        `DELETE ${pinPath(blankNote.id)}`,
      ]),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pin note" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(titles()[0]).toBe("The salt flats");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(patches(blankNote.id)).toEqual([]);
  });
});

describe("a new note", () => {
  it("is made at once, the DM's alone, and lands in the pane with its title selected", async () => {
    const made = {
      ...blankNote,
      category: null,
      pinnedAt: null,
      id: newId,
      title: "Untitled note",
      createdAt: "2026-08-09T09:00:00.000Z",
    };
    server.routes.set(`POST ${notesPath}`, { status: 200, body: made });
    server.routes.set(`PATCH ${notesPath}/${newId}`, { status: 200, body: made });
    await open(`?note=${grusk.id}`);
    await userEvent.type(screen.getByRole("combobox", { name: "Search notes" }), "toll");

    // Secondary, not peach: `shell/primaries.test.tsx` counts this screen.
    await userEvent.click(screen.getByRole("button", { name: "New note" }));

    await waitFor(() => expect(chosen()).toBe(newId));
    expect(JSON.parse(server.calls.find((call) => call.method === "POST")?.body ?? "{}")).toEqual({
      title: "Untitled note",
      kind: "note",
      visibility: "dm",
    });
    expect(screen.getByRole("article")).toHaveAccessibleName("Untitled note");
    // First after the pinned, even before the list's own read has it, and
    // the search is cleared so it can be seen.
    expect(titles().slice(0, 2)).toEqual(["The salt flats", "Untitled note"]);
    expect(rows()).toHaveLength(5);

    const title = screen.getByRole("textbox", { name: "Title" });
    await waitFor(() => expect(title).toHaveFocus());
    expect([
      (title as HTMLInputElement).selectionStart,
      (title as HTMLInputElement).selectionEnd,
    ]).toEqual([0, "Untitled note".length]);

    // Typing replaces it.
    await userEvent.keyboard("The crate");
    await userEvent.tab();
    await waitFor(() => expect(patches(newId)).toEqual([{ title: "The crate" }]));
  });
});

describe("deleting a note", () => {
  const ask = async () => {
    await open(`?note=${grusk.id}`);
    await userEvent.click(screen.getByRole("button", { name: "Note actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete note" }));
    return screen.findByRole("dialog", { name: `Delete ${grusk.title}?` });
  };

  it("asks first, and keeping it sends nothing", async () => {
    const dialog = await ask();
    expect(within(dialog).getByText(`Delete ${grusk.title}?`)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(server.calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("deletes, re-reads the notes, and the pane falls to the first row", async () => {
    server.routes.set(`DELETE ${notesPath}/${grusk.id}`, { status: 204 });
    const dialog = await ask();
    const readsBefore = reads();
    server.routes.set(`GET ${notesPath}`, {
      status: 200,
      body: page(noteShelf.filter((note) => note.id !== grusk.id)),
    });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete note" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      server.calls.some(
        (call) => call.method === "DELETE" && call.pathname === `${notesPath}/${grusk.id}`,
      ),
    ).toBe(true);
    await waitFor(() => expect(reads()).toBeGreaterThan(readsBefore));
    await waitFor(() => expect(chosen()).toBeNull());
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Grusk/ })).toBeNull());
    expect(screen.getByRole("article")).toHaveAccessibleName(blankNote.title);
  });
});
