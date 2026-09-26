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
  it("lists newest first, marks the shared ones, and previews the first line", async () => {
    await open();

    expect(rows().map((row) => row.querySelector("span")?.textContent)).toEqual([
      "House rule: flankingShared",
      "Grusk, the toll-keeper",
      "Read aloud at the water",
      "The salt flats",
    ]);
    // Only the shared note is marked: the default is the DM's alone.
    expect(within(rowFor("House rule")).getByText("Shared")).toBeInTheDocument();
    expect(within(rowFor("Grusk")).queryByText("Shared")).toBeNull();
    // The first line, not the whole body.
    expect(rowFor("Grusk")).toHaveTextContent(/Owes the Salt Company more than he admits\./);
    expect(rowFor("Grusk")).not.toHaveTextContent(/in favours/);
    expect(rowFor("The salt flats")).toHaveTextContent("Empty note");
    expect(rowFor("Read aloud at the water")).toHaveTextContent(/Read aloud · Edited /);
    expect(rowFor("Grusk")).toHaveTextContent(/Note · Edited /);
    expect(screen.getByText("4 notes")).toBeInTheDocument();
  });

  it("puts the first row in the pane when nothing is chosen", async () => {
    const pane = await open();
    expect(pane).toHaveAccessibleName(houseRule.title);
    expect(rowFor("House rule")).toHaveAttribute("aria-current", "true");
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

    expect(await screen.findByText(/Nothing here answers to/)).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Search notes" })).toBeInTheDocument();
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

describe("a new note", () => {
  it("is made at once, the DM's alone, and lands in the pane with its title selected", async () => {
    const made = {
      ...blankNote,
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
    // First in the list, even before the list's own read has it, and the
    // search is cleared so it can be seen.
    expect(rows()[0]).toHaveAccessibleName(/^Untitled note/);
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
    expect(screen.getByRole("article")).toHaveAccessibleName(houseRule.title);
  });
});
