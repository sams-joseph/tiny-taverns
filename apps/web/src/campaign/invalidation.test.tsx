import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  encounter,
  encounterId,
  goblinId,
  installMemoryStorage,
  installStubServer,
  mintingSession,
  page,
  prepItem,
  prepItemId,
  readAloud,
  renderEncounters,
  renderNotes,
  renderScreen,
  sessionId,
  type StubServer,
} from "./campaign.fixtures";

/**
 * **What a write refreshes, and — the half that matters — what it does not.**
 *
 * This file is the test the old design made unnecessary and the new one makes
 * essential. Until writes named their reads, every structural write on these
 * screens ended in `reload()` and re-read the whole campaign: staleness was not
 * expressible, and the cost was one write and eight reads to add one line to a
 * checklist. Now a write names the resources it changed (`api/keys.ts`) and only
 * those are re-read — which is faster, and wrong the moment somebody forgets a
 * name.
 *
 * So there are two kinds of assertion here and both are load-bearing:
 *
 *  - **a request count**, which is what the narrowing bought and what would
 *    quietly grow back if a screen reintroduced a broad re-read;
 *  - **the other card**, for every write that changes something outside its own
 *    response. Those are the ones a forgotten key breaks, and they are the
 *    reason the counts are safe to want.
 *
 * The graph itself is in `api/keys.ts`; the seam that makes it work is pinned in
 * `api/atoms.test.tsx`. This file is about the wiring between them, screen by
 * screen.
 */

const server = installStubServer();
installMemoryStorage();

const prepPath = `/campaigns/${campaignId}/sessions/${sessionId}/prep`;
const encountersPath = `/campaigns/${campaignId}/encounters`;
const notesPath = `/campaigns/${campaignId}/notes`;

beforeEach(() => {
  server.reset();
  window.localStorage.clear();
});

/** Everything asked for since `server.calls.length = 0`, as `METHOD /path`. */
const since = (from: number): ReadonlyArray<string> =>
  server.calls.slice(from).map((call) => `${call.method} ${call.pathname}`);

/** How many times a path was read since a mark. */
const reads = (from: number, path: string): number =>
  server.calls.filter(
    (call, index) => index >= from && call.method === "GET" && call.pathname === path,
  ).length;

/**
 * The measured case, and the one the whole change exists for.
 *
 * Before: one `POST` and **eight** `GET`s — the campaign, the memberships, the
 * encounters, the notes, the characters, the session, the checklist and the
 * night's fights. Measured in Chromium and reproduced here.
 */
describe("adding a line to the checklist", () => {
  it("costs one write and one read, and reads nothing else at all", async () => {
    server.routes.set(`POST ${prepPath}`, {
      status: 200,
      body: { ...prepItem, id: prepItemId, label: "Print the map" },
    });
    await renderScreen(mintingSession());
    await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });

    const mark = server.calls.length;
    await userEvent.type(
      screen.getByRole("textbox", { name: "Add to the checklist" }),
      "Print the map",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(reads(mark, prepPath)).toBe(1));
    // …and nothing else moved. Spelled as the whole list rather than as a
    // count, so a failure names the read that came back.
    expect(since(mark)).toEqual([`POST ${prepPath}`, `GET ${prepPath}`]);
  });

  /**
   * The tick was already one request and stays one — it names no reads at all,
   * because the checkbox has already rendered its own answer and a refresh
   * would be a request whose result the override is sitting on top of.
   */
  it("ticking a box still costs one request and re-reads nothing", async () => {
    await renderScreen(mintingSession());
    const box = await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });

    const mark = server.calls.length;
    await userEvent.click(box);

    await waitFor(() => expect(server.calls.length).toBeGreaterThan(mark));
    expect(since(mark)).toEqual([`PATCH ${prepPath}/${prepItemId}`]);
  });
});

/**
 * **`Encounter.creatureCount` is `sum(encounter_creature.count)`, computed per
 * read.** So saving a roster line moves a number on the encounter card without
 * the encounter row ever being sent — the first of the two cases
 * `CampaignChrome.tsx` named when it argued for re-reading everything.
 */
describe("a roster line, which moves a number the write never sent", () => {
  const rosterPath = `${encountersPath}/${encounterId}/creatures`;

  const withRoster = (count: number) => {
    server.routes.set(`GET ${encountersPath}`, {
      status: 200,
      body: page([{ ...encounter, creatureCount: count }]),
    });
  };

  it("redraws the card's creature count, and re-reads only the encounters", async () => {
    withRoster(6);
    server.routes.set(`GET ${rosterPath}`, { status: 200, body: [] });
    server.routes.set(`PATCH ${encountersPath}/${encounterId}`, {
      status: 200,
      body: encounter,
    });
    server.routes.set(`POST ${rosterPath}`, {
      status: 200,
      body: {
        id: "2b1f2a1e-0000-4000-8000-000000000b09",
        encounterId,
        creatureId: goblinId,
        count: 1,
        visibility: "dm",
        origin: "authored",
        assistantTurnId: null,
        createdAt: "2026-08-04T13:03:28.070Z",
        updatedAt: "2026-08-04T13:03:28.070Z",
      },
    });
    await renderEncounters(mintingSession());
    // The card carries the note count too — the fixture attaches one — which is
    // the other half of this describe block and is why the whole line is matched.
    expect(await screen.findByText("6 creatures · 1 note")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit Ambush in the reeds" }));
    await screen.findByRole("button", { name: "Add Goblin Boss" });

    // The server will answer the *next* read of the list with the new total —
    // which is the whole point: the browser cannot compute it.
    withRoster(7);
    const mark = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Add Goblin Boss" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // The card behind the dialog says the new number.
    expect(await screen.findByText("7 creatures · 1 note")).toBeInTheDocument();
    expect(reads(mark, encountersPath)).toBe(1);
    // And the notes are not touched: nothing about a roster is a note.
    expect(reads(mark, notesPath)).toBe(0);
  });
});

/**
 * **A note's attachment moves the note count on an encounter card**, which is
 * counted in the browser over the notes list — the second case the frame's own
 * doc block named, and the one that crosses a screen.
 *
 * It is answered by naming the *resource* rather than the screen: the note write
 * refreshes `reads.notes`, and the encounters screen counts its notes over the
 * same atom. Nobody has to know that screen exists.
 */
describe("a note's attachment, which moves a count on a screen it never saw", () => {
  it("re-reads the notes and not the encounters", async () => {
    server.routes.set(`PATCH ${notesPath}/${readAloud.id}`, { status: 200, body: readAloud });
    await renderNotes(mintingSession());
    await screen.findByRole("button", { name: `Edit ${readAloud.title}` });

    const mark = server.calls.length;
    await userEvent.click(screen.getByRole("button", { name: `Edit ${readAloud.title}` }));
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(reads(mark, notesPath)).toBe(1));
    expect(reads(mark, encountersPath)).toBe(0);
    expect(reads(mark, `/campaigns/${campaignId}`)).toBe(0);
  });

  it("and the encounter card counts the note the moment it is drawn", async () => {
    // The wire either side of the write: nothing attached, then attached. What
    // is asserted is that the *encounters* screen, which the note dialog has
    // never seen, draws the new count from the refreshed notes rather than from
    // a read of its own.
    server.routes.set(`GET ${notesPath}`, {
      status: 200,
      body: page([{ ...readAloud, attachedTo: null }]),
    });
    server.routes.set(`PATCH ${notesPath}/${readAloud.id}`, { status: 200, body: readAloud });
    await renderNotes(mintingSession());
    await screen.findByRole("button", { name: `Edit ${readAloud.title}` });

    server.routes.set(`GET ${notesPath}`, { status: 200, body: page([readAloud]) });
    await userEvent.click(screen.getByRole("button", { name: `Edit ${readAloud.title}` }));
    await userEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const mark = server.calls.length;
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "This campaign" })).getByRole("link", {
        name: "Encounters",
      }),
    );

    expect(await screen.findByText("6 creatures · 1 note")).toBeInTheDocument();
    // Nothing was read on the way: the count is drawn from the notes the write
    // refreshed, and the encounters are the same atom the frame already held.
    expect(since(mark).filter((call) => call.startsWith("GET"))).toEqual([]);
  });
});

/**
 * A refused write refreshes nothing, and that is `Reactivity.mutation`'s own
 * rule carried into `submit`: re-reading to prove that nothing moved is a
 * request for no answer, and on a screen that is failing it is the wrong thing
 * to be doing.
 */
describe("a write the server refuses", () => {
  it("re-reads nothing", async () => {
    server.routes.set(`POST ${prepPath}`, {
      status: 404,
      body: { _tag: "NotFound", resource: "session", id: sessionId },
    });
    await renderScreen(mintingSession());
    await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });

    const mark = server.calls.length;
    await userEvent.type(
      screen.getByRole("textbox", { name: "Add to the checklist" }),
      "Print the map",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await screen.findByRole("alert");
    expect(since(mark)).toEqual([`POST ${prepPath}`]);
  });
});

/**
 * The three campaign destinations share one campaign view, so a write on one of
 * them must not re-read for the other two — and moving between them must still
 * cost nothing, which is what phase 1 bought and this change had to keep.
 */
describe("what the split did not cost", () => {
  const clean = async (server: StubServer, path: () => Promise<void>) => {
    cleanup();
    server.calls.length = 0;
    await path();
  };

  it("still answers the second destination from the registry, with no request", async () => {
    await renderScreen(mintingSession());
    await screen.findByRole("heading", { name: "Overview" });
    const cold = server.calls.length;
    expect(cold).toBeGreaterThan(1);

    await userEvent.click(
      within(screen.getByRole("navigation", { name: "This campaign" })).getByRole("link", {
        name: "Notes",
      }),
    );
    await screen.findByRole("heading", { name: "Notes" });
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "This campaign" })).getByRole("link", {
        name: "Encounters",
      }),
    );
    await screen.findByRole("heading", { name: "Encounters" });

    expect(server.calls.length).toBe(cold);
    void clean;
  });
});
