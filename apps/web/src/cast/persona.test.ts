import { Npc, type NpcId, type CampaignId } from "@taverns/api";
import { DateTime } from "effect";
import { describe, expect, it } from "vitest";
import {
  describeNpc,
  draftOf,
  emptyDraft,
  hasAdvanced,
  hasPrivateMaterial,
  initialsOf,
  npcMatches,
  personaFrom,
  privateKeys,
  privateMaterialFrom,
} from "./persona";

/**
 * The form's flat drafts and the two documents they become.
 *
 * The one property worth a file of its own: **the public document never reads
 * a private key.** A secret typed into the wrong box would render fine and be
 * one audience away from a leak, so it is checked here with every private key
 * filled and the public document asserted byte-for-byte.
 */

const stamp = DateTime.makeUnsafe("2026-09-08T12:00:00.000Z");

const row = (overrides: Partial<ConstructorParameters<typeof Npc>[0]> = {}): Npc =>
  new Npc({
    id: "2b1f2a1e-0000-4000-8000-00000000d0c1" as NpcId,
    campaignId: "2b1f2a1e-0000-4000-8000-00000000c0de" as CampaignId,
    derivedFrom: null,
    name: "Cazril",
    role: "the ferryman",
    persona: {},
    privateMaterial: {},
    version: 1,
    archivedAt: null,
    visibility: "dm",
    origin: "authored",
    assistantTurnId: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  });

describe("the two documents", () => {
  it("writes an empty draft as two empty documents — the column defaults", () => {
    expect(personaFrom(emptyDraft)).toEqual({});
    expect(privateMaterialFrom(emptyDraft)).toEqual({});
  });

  it("keeps private material out of the public document, whatever is typed", () => {
    const draft = {
      ...emptyDraft,
      name: "Cazril",
      summary: "Takes names, not coin.",
      secrets: "The hag pays him in years.",
      instructions: "Go silent when the crate comes up.",
    };

    expect(personaFrom(draft)).toEqual({ identity: { summary: "Takes names, not coin." } });
    expect(privateMaterialFrom(draft)).toEqual({
      secrets: "The hag pays him in years.",
      instructions: "Go silent when the crate comes up.",
    });
    // And the list a later slice reads to know which keys are private is the
    // whole of what the private document is built from.
    expect([...privateKeys].sort()).toEqual(["instructions", "secrets"]);
    const publicText = JSON.stringify(personaFrom(draft));
    for (const key of privateKeys) expect(publicText).not.toContain(draft[key]);
  });

  it("splits list boxes on lines, trims, drops blanks, and leaves an empty section absent", () => {
    const draft = {
      ...emptyDraft,
      phrases: " Names keep. \n\n  Coin sinks.  \n",
      dodges: "\n",
      wants: "   ",
    };

    expect(personaFrom(draft)).toEqual({ voice: { phrases: ["Names keep.", "Coin sinks."] } });
  });

  it("round-trips a full row through the form and back", () => {
    const full = row({
      persona: {
        identity: { pronouns: "he/him", pronunciation: "KAZ-ril", summary: "Old." },
        voice: { manner: "Dry.", phrases: ["a", "b"], exampleLines: ["c"] },
        intent: { wants: "w", fears: "f", loyalties: "l", attitude: "a" },
        boundaries: { dodges: ["d"], refuses: ["r"], asksTheDm: ["q"] },
      },
      privateMaterial: { secrets: "s", instructions: "i" },
    });
    const draft = draftOf(full);

    expect(draft.phrases).toBe("a\nb");
    expect(personaFrom(draft)).toEqual(full.persona);
    expect(privateMaterialFrom(draft)).toEqual(full.privateMaterial);
    expect(hasAdvanced(draft)).toBe(true);
    expect(hasAdvanced({ ...emptyDraft, name: "x", summary: "y", manner: "z" })).toBe(false);
  });
});

describe("what the card and the detail say", () => {
  it("draws two initials, whatever the name's shape", () => {
    expect(initialsOf("Cazril")).toBe("CA");
    expect(initialsOf("Old Fen")).toBe("OF");
    expect(initialsOf("  ")).toBe("?");
  });

  it("describes an NPC by its summary, then its manner, then honestly", () => {
    expect(describeNpc(row({ persona: { identity: { summary: "Old." } } }))).toBe("Old.");
    expect(describeNpc(row({ persona: { voice: { manner: "Dry." } } }))).toBe("Dry.");
    expect(describeNpc(row())).toBe("No persona written yet.");
  });

  it("marks private material only when there is some", () => {
    expect(hasPrivateMaterial(row())).toBe(false);
    expect(hasPrivateMaterial(row({ privateMaterial: { secrets: " " } }))).toBe(false);
    expect(hasPrivateMaterial(row({ privateMaterial: { instructions: "x" } }))).toBe(true);
  });

  it("searches the name, the role, the summary and the manner, and never the private material", () => {
    const npc = row({
      persona: { identity: { summary: "Takes names." }, voice: { manner: "Dry." } },
      privateMaterial: { secrets: "HAGPAYS" },
    });
    expect(npcMatches("ferry", npc)).toBe(true);
    expect(npcMatches("NAMES", npc)).toBe(true);
    expect(npcMatches("dry", npc)).toBe(true);
    expect(npcMatches("hagpays", npc)).toBe(false);
    expect(npcMatches("  ", npc)).toBe(true);
  });
});
