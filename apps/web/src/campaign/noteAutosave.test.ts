import type { NoteUpdate } from "@taverns/api";
import { Result } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiFailure } from "../api/failure";
import { AUTOSAVE_DELAY_MS, changesOf, NoteSaver, type NoteFields } from "./noteAutosave";

/**
 * The saver's timing, with the wire replaced by promises the test settles by
 * hand: what goes when, and never two requests for one note at once. The
 * screen over the stub wire is `notesPage.test.tsx`.
 */

const note: NoteFields = {
  title: "Grusk",
  body: "Half-orc.",
  kind: "note",
  attachedTo: null,
  visibility: "dm",
};

const unreachable: ApiFailure = { kind: "unreachable" };

/** A wire whose every request waits until the test answers it. */
const wire = () => {
  const sent: Array<NoteUpdate> = [];
  const pending: Array<(result: Result.Result<unknown, ApiFailure>) => void> = [];
  const send = (patch: NoteUpdate) => {
    sent.push(patch);
    return new Promise<Result.Result<unknown, ApiFailure>>((resolve) => pending.push(resolve));
  };
  const answer = async (result: Result.Result<unknown, ApiFailure> = Result.succeed(null)) => {
    pending.shift()?.(result);
    // Let the saver's own continuation run.
    await vi.advanceTimersByTimeAsync(0);
  };
  return { sent, send, answer, inFlight: () => pending.length };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("changesOf", () => {
  it("names only what differs, and never an empty title", () => {
    expect(changesOf(note, note)).toEqual({});
    expect(changesOf({ ...note, body: "Orc." }, note)).toEqual({ body: "Orc." });
    expect(changesOf({ ...note, title: "  Grusk  " }, note)).toEqual({});
    expect(changesOf({ ...note, title: "   ", body: "Orc." }, note)).toEqual({ body: "Orc." });
    expect(
      changesOf({ ...note, attachedTo: { kind: "encounter", id: "e" as never } }, note),
    ).toEqual({ attachedTo: { kind: "encounter", id: "e" } });
  });
});

describe("NoteSaver", () => {
  it("waits for typing to stop, then sends it once", async () => {
    const { sent, send, answer } = wire();
    const saver = new NoteSaver(note, send);

    saver.type({ body: "H" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    saver.type({ body: "Ha" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(sent).toEqual([]);
    expect(saver.status.state).toBe("saving");

    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([{ body: "Ha" }]);
    await answer();
    expect(saver.status.state).toBe("saved");
  });

  it("never has two requests out, and sends what piled up after the first returns", async () => {
    const { sent, send, answer, inFlight } = wire();
    const saver = new NoteSaver(note, send);

    saver.type({ body: "One" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(inFlight()).toBe(1);

    // Typing, a blur and a discrete change while the first is on the wire.
    saver.type({ body: "One two" });
    void saver.flush();
    void saver.set({ visibility: "shared" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(inFlight()).toBe(1);
    expect(sent).toHaveLength(1);

    await answer();
    // Coalesced: one request for everything that changed meanwhile.
    expect(sent).toEqual([{ body: "One" }, { body: "One two", visibility: "shared" }]);
    expect(inFlight()).toBe(1);
    await answer();
    expect(sent).toHaveLength(2);
    expect(saver.status.state).toBe("saved");
  });

  it("sends at once on flush, with nothing left for the timer", async () => {
    const { sent, send, answer } = wire();
    const saver = new NoteSaver(note, send);

    saver.type({ title: "Grusk the toll-keeper" });
    void saver.flush();
    expect(sent).toEqual([{ title: "Grusk the toll-keeper" }]);
    await answer();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(sent).toHaveLength(1);
  });

  it("sends nothing when the draft is back where it started", async () => {
    const { sent, send } = wire();
    const saver = new NoteSaver(note, send);

    saver.type({ body: "Half-orc!" });
    saver.type({ body: "Half-orc." });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(sent).toEqual([]);
  });

  it("holds an emptied title back and saves the rest", async () => {
    const { sent, send, answer } = wire();
    const saver = new NoteSaver(note, send);

    saver.type({ title: "" });
    saver.type({ body: "Orc." });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(sent).toEqual([{ body: "Orc." }]);
    await answer();
    expect(saver.status.state).toBe("saved");

    saver.type({ title: "Grusk" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    // The server still holds "Grusk": nothing to say.
    expect(sent).toHaveLength(1);
  });

  it("keeps a failure until the next attempt, which sends the same change again", async () => {
    const { sent, send, answer } = wire();
    const saver = new NoteSaver(note, send);

    void saver.set({ kind: "read_aloud" });
    await answer(Result.fail(unreachable));
    expect(saver.status).toEqual({ state: "failed", failure: unreachable });

    void saver.flush();
    expect(sent).toEqual([{ kind: "read_aloud" }, { kind: "read_aloud" }]);
    await answer();
    expect(saver.status.state).toBe("saved");
  });

  it("sends nothing while stopped for a delete, and picks up again if it is refused", async () => {
    const { sent, send } = wire();
    const saver = new NoteSaver(note, send);

    saver.type({ body: "Orc." });
    saver.stop();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    void saver.flush();
    expect(sent).toEqual([]);

    saver.resume();
    expect(sent).toEqual([{ body: "Orc." }]);
  });
});
