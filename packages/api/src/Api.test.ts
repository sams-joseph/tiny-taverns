import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Authorization } from "./Actor.js";
import { TavernsApi } from "./Api.js";
import { Beat, BeatCreate } from "./Beat.js";
import { Campaign, CampaignCreate } from "./Campaign.js";
import { Character, CharacterCreate } from "./Character.js";
import { Combatant, CombatantCreate } from "./Combatant.js";
import { Creature, CreatureCreate } from "./Creature.js";
import { Encounter, EncounterCreate } from "./Encounter.js";
import { EncounterCreature, EncounterCreatureCreate } from "./EncounterCreature.js";
import { EncounterRun, EncounterRunStart } from "./EncounterRun.js";
import { CampaignId } from "./Ids.js";
import { Note, NoteCreate } from "./Note.js";
import { PrepItem, PrepItemCreate } from "./PrepItem.js";
import { Session, SessionCreate } from "./Session.js";
import { SessionEvent } from "./SessionEvent.js";

/**
 * The runtime shape this file introspects.
 *
 * Spelled out rather than borrowed from `HttpApiGroup.Constraint` / `.Top`:
 * neither is assignable from a concrete prefixed group, and the only properties
 * read here are these three.
 */
interface GroupShape {
  readonly identifier: string;
  readonly endpoints: Record<
    string,
    { readonly identifier: string; readonly middlewares: ReadonlySet<unknown> }
  >;
}

const groups = Object.values(TavernsApi.groups) as unknown as ReadonlyArray<GroupShape>;

const endpointsOf = (group: GroupShape) => Object.values(group.endpoints);

describe("the API declaration", () => {
  it("puts every campaign-scoped endpoint behind Authorization", () => {
    // The fail-closed guard for the transport: a group added without
    // `.middleware(Authorization)` is an unauthenticated endpoint, and the only
    // way to have one is to name it here.
    const unauthenticated = groups
      .flatMap((group) =>
        endpointsOf(group).map((endpoint) => ({
          path: `${group.identifier}.${endpoint.identifier}`,
          middlewares: endpoint.middlewares,
        })),
      )
      .filter(({ middlewares }) => !middlewares.has(Authorization))
      .map(({ path }) => path);

    // **Two, and the second was a deliberate act.** `invitePreview.read` is the
    // invitation page's read: it answers before its reader has an account,
    // which is the entire point of it, so there is no actor to put above it. It
    // is scoped by the token instead — a live invitation and nothing else —
    // and what it discloses is bounded to the campaign's name, the DM's name
    // and a deadline. See `Invite.ts` for the trade and `repo/Invites.ts` for
    // the read. Adding a third name here should be at least as hard.
    expect(unauthenticated).toEqual(["health.check", "invitePreview.read"]);
  });

  it("declares the groups the product has today, and no more", () => {
    expect(groups.map((group) => group.identifier).sort()).toEqual([
      "beats",
      "campaigns",
      "characters",
      "combatants",
      "creatures",
      "encounterCreatures",
      "encounters",
      "health",
      "hob",
      "invitePreview",
      "invites",
      "join",
      "live",
      "me",
      "members",
      "notes",
      "prep",
      "recap",
      "runs",
      "search",
      "sessions",
    ]);
  });
});

describe("every content schema", () => {
  const contentSchemas = {
    Beat,
    Campaign,
    Session,
    Character,
    Note,
    Encounter,
    PrepItem,
    Creature,
    EncounterCreature,
    EncounterRun,
    Combatant,
    // Append-only, and still a content row: a log line can quote a DM-only
    // read-aloud, so it fails closed like everything else. There is
    // deliberately no `SessionEventCreate` — the log has no create payload
    // because nothing outside a mutation's own transaction may write to it.
    SessionEvent,
  };

  it("carries visibility and provenance", () => {
    for (const [name, schema] of Object.entries(contentSchemas)) {
      const fields = Object.keys(schema.fields);

      expect(fields, `${name} has no visibility`).toContain("visibility");
      expect(fields, `${name} has no origin`).toContain("origin");
      expect(fields, `${name} has no assistantTurnId`).toContain("assistantTurnId");
    }
  });

  it("leaves visibility optional on create, so the column default decides", () => {
    // The `dm` default is stated once, in the migration. A create payload that
    // required a visibility would move that decision to every caller.
    const creates = {
      CampaignCreate,
      SessionCreate,
      CharacterCreate,
      NoteCreate,
      EncounterCreate,
      PrepItemCreate,
      CreatureCreate,
      EncounterCreatureCreate,
      EncounterRunStart,
      CombatantCreate,
      BeatCreate,
    };
    // The minimum a create needs, per schema. Spelled out rather than merged
    // into one wide object, so a payload that stopped requiring a field would
    // show up here rather than being silently over-supplied.
    const minimal: Record<string, Record<string, unknown>> = {
      CampaignCreate: { name: "x" },
      SessionCreate: { number: 1, title: "t" },
      CharacterCreate: { name: "x" },
      NoteCreate: { title: "x" },
      EncounterCreate: { name: "x" },
      PrepItemCreate: { label: "x" },
      CreatureCreate: { name: "x", type: "Humanoid", cr: "1/4", ac: 15, hp: 11 },
      EncounterCreatureCreate: { creatureId: "2b1f2a1e-0000-4000-8000-00000000c0de" },
      EncounterRunStart: { encounterId: "2b1f2a1e-0000-4000-8000-00000000c0de" },
      CombatantCreate: { displayName: "x" },
      BeatCreate: { body: "The ferryman is called Cazril." },
    };

    for (const [name, schema] of Object.entries(creates)) {
      const decoded = Schema.decodeUnknownSync(schema)(minimal[name]!) as Record<string, unknown>;

      expect(decoded.visibility, `${name} forces a visibility`).toBeUndefined();
    }
  });
});

describe("identifiers", () => {
  it("reject anything that is not a UUID", () => {
    const decode = Schema.decodeUnknownEffect(CampaignId);

    expect(Effect.runSync(Effect.result(decode("not-a-uuid")))._tag).toBe("Failure");
    expect(Effect.runSync(Effect.result(decode("2b1f2a1e-0000-4000-8000-00000000c0de")))._tag).toBe(
      "Success",
    );
  });
});
