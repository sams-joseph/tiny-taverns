import { type Npc, type NpcUpdate, UNNAMED_NPC } from "@taverns/api";
import { Result } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiFailure } from "../api/failure";
import { AUTOSAVE_DELAY_MS } from "../ui/autosave";
import { npcChangesOf, npcFieldsOf, npcUpdateOf, NpcSaver } from "./npcAutosave";

/**
 * The NPC drawer's saver without a screen: which lines a change rebuilds, the
 * role held for a settled save, the version each request names, and the halt
 * on a conflict. The shared timing it rides on is `noteAutosave.test.ts`'s;
 * the drawer over the stub wire is `NpcDrawer.test.tsx`.
 */

const row = {
  id: "2b1f2a1e-0000-4000-8000-00000000d0c1",
  campaignId: "2b1f2a1e-0000-4000-8000-00000000c0de",
  name: "Cazril",
  role: "the ferryman",
  persona: {
    identity: { pronouns: "he/him", appearance: "Stooped and weathered." },
    voice: { manner: "Slow and dry.", phrases: ["Names keep."] },
    boundaries: { refuses: ["Naming the hag"] },
  },
  privateMaterial: { secrets: "The hag pays him.", instructions: "Pole faster." },
  visibility: "dm",
  version: 3,
} as unknown as Npc;

const fields = npcFieldsOf(row);

describe("npcFieldsOf", () => {
  it("shows a blank NPC's placeholder name as an empty field", () => {
    expect(npcFieldsOf({ ...row, name: UNNAMED_NPC } as Npc).name).toBe("");
    expect(fields).toEqual({
      name: "Cazril",
      role: "the ferryman",
      manner: "Slow and dry.",
      wants: "",
      secrets: "The hag pays him.",
      visibility: "dm",
    });
  });
});

describe("npcChangesOf", () => {
  it("names the role only when the ask is settled", () => {
    const draft = { ...fields, role: "the hag's ferr" };
    expect(npcChangesOf(draft, fields, false)).toEqual({});
    expect(npcChangesOf(draft, fields, true)).toEqual({ role: "the hag's ferr" });
  });

  it("never sends an empty name, and ignores what only whitespace changed", () => {
    expect(npcChangesOf({ ...fields, name: "  " }, fields, true)).toEqual({});
    expect(npcChangesOf({ ...fields, manner: "Slow and dry.  " }, fields, false)).toEqual({});
    expect(npcChangesOf({ ...fields, wants: "Peace." }, fields, false)).toEqual({
      wants: "Peace.",
    });
  });
});

describe("npcUpdateOf", () => {
  it("rebuilds the persona whole from the row, with only the edited line replaced", () => {
    expect(npcUpdateOf(row, { wants: "Peace." })).toEqual({
      expectedVersion: 3,
      persona: { ...row.persona, intent: { wants: "Peace." } },
    });
  });

  it("puts the secret only in the private material, keeping the instructions", () => {
    const update = npcUpdateOf(row, { secrets: "He owes the hag." });
    expect(update).toEqual({
      expectedVersion: 3,
      privateMaterial: { secrets: "He owes the hag.", instructions: "Pole faster." },
    });
    expect(update.persona).toBeUndefined();
  });

  it("sends a column alone, without either document", () => {
    expect(npcUpdateOf(row, { name: "Old Cazril", visibility: "shared" })).toEqual({
      expectedVersion: 3,
      name: "Old Cazril",
      visibility: "shared",
    });
  });
});

describe("NpcSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const wire = (answer: (update: NpcUpdate) => Result.Result<Npc, ApiFailure>) => {
    const sent: Array<NpcUpdate> = [];
    const send = (update: NpcUpdate) => {
      sent.push(update);
      return Promise.resolve(answer(update));
    };
    return { sent, send };
  };

  it("waits for a settle to send a typed role, and sends the rest on the pause", async () => {
    const { sent, send } = wire(() => Result.succeed({ ...row, version: 4 } as Npc));
    const saver = new NpcSaver(row, send);

    saver.type({ role: "the hag's ferryman" });
    saver.type({ manner: "Dry." });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(sent).toEqual([
      {
        expectedVersion: 3,
        persona: { ...row.persona, voice: { ...row.persona.voice, manner: "Dry." } },
      },
    ]);
    // The role is still to be saved, and the saver says so.
    expect(saver.status.state).toBe("saving");

    await saver.flush();
    // Built on the row the first save answered.
    expect(sent[1]).toEqual({ expectedVersion: 4, role: "the hag's ferryman" });
    expect(saver.status.state).toBe("saved");
  });

  it("stops sending after a conflict, until the NPC is read again", async () => {
    const conflict: ApiFailure = { kind: "conflict", message: "Changed elsewhere." };
    const { sent, send } = wire(() => Result.fail(conflict));
    const saver = new NpcSaver(row, send);

    await saver.set({ visibility: "shared" });
    expect(saver.status).toEqual({ state: "failed", failure: conflict });
    saver.type({ wants: "Peace." });
    await saver.flush();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    expect(sent).toHaveLength(1);
    expect(saver.status.state).toBe("failed");
  });

  it("retries anything else on the next ask", async () => {
    let fail = true;
    const { sent, send } = wire(() =>
      fail ? Result.fail({ kind: "unreachable" }) : Result.succeed({ ...row, version: 4 } as Npc),
    );
    const saver = new NpcSaver(row, send);

    await saver.set({ visibility: "shared" });
    expect(saver.status.state).toBe("failed");
    fail = false;
    await saver.flush();
    expect(sent).toHaveLength(2);
    expect(saver.status.state).toBe("saved");
  });
});
