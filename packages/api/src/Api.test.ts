import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Authorization } from "./Actor.js";
import { TavernsApi } from "./Api.js";
import { Beat, BeatCreate } from "./Beat.js";
import { Campaign, CampaignCreate } from "./Campaign.js";
import { Character, CharacterOwnCreate } from "./Character.js";
import { CampaignInvite, InvitePreview, InviteRedeemed } from "./Invite.js";
import { CampaignCharacter, PartyJoin } from "./Party.js";
import { Combatant, CombatantCreate } from "./Combatant.js";
import { Creature, CreatureCreate } from "./Creature.js";
import { Encounter, EncounterCreate } from "./Encounter.js";
import { EncounterCreature, EncounterCreatureCreate } from "./EncounterCreature.js";
import { Equipment, EquipmentCreate } from "./Equipment.js";
import { EncounterRun, EncounterRunStart } from "./EncounterRun.js";
import { MagicItem, MagicItemCreate } from "./MagicItem.js";
import { CampaignId } from "./Ids.js";
import { Note, NoteCreate } from "./Note.js";
import { Npc, NpcCreate } from "./Npc.js";
import { PrepItem, PrepItemCreate } from "./PrepItem.js";
import { Roll, RollCreate } from "./Roll.js";
import { RuleArticle, RuleArticleLibraryCreate } from "./RuleArticle.js";
import { Session, SessionCreate } from "./Session.js";
import { SessionEvent } from "./SessionEvent.js";
import { Spell, SpellCreate } from "./Spell.js";

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
    {
      readonly identifier: string;
      readonly method: string;
      readonly path: string;
      readonly params?: unknown;
      readonly query?: unknown;
      readonly middlewares: ReadonlySet<unknown>;
    }
  >;
}

const groups = Object.values(TavernsApi.groups) as unknown as ReadonlyArray<GroupShape>;

const endpointsOf = (group: GroupShape) => Object.values(group.endpoints);

describe("the API declaration", () => {
  it("exposes only invitations that belong to a campaign", () => {
    const decode = Schema.decodeUnknownSync(CampaignInvite);
    const invitation = {
      id: "2b1f2a1e-0000-4000-8000-00000000a001",
      campaignId: "2b1f2a1e-0000-4000-8000-00000000a003",
      label: "Ilse",
      status: "live",
      expiresAt: "2026-09-23T12:00:00.000Z",
      revokedAt: null,
      redeemedAt: null,
      redeemedByName: null,
      createdAt: "2026-09-09T12:00:00.000Z",
    };

    expect(decode(invitation).campaignId).toBe(invitation.campaignId);
    expect(() => decode({ ...invitation, campaignId: null })).toThrow();
  });

  it("keeps backing contexts out of campaign invitation responses", () => {
    const decodePreview = Schema.decodeUnknownSync(InvitePreview);
    const decodeRedeemed = Schema.decodeUnknownSync(InviteRedeemed);
    const preview = {
      kind: "campaign",
      campaignName: "The Salt Road",
      creatorName: "Ada",
      sharedWorldName: null,
      expiresAt: "2026-09-23T12:00:00.000Z",
    };
    const redeemed = {
      kind: "campaign",
      campaignId: "2b1f2a1e-0000-4000-8000-00000000a003",
      campaignName: "The Salt Road",
      sharedWorld: null,
      shared: false,
    };

    expect(decodePreview(preview).kind).toBe("campaign");
    expect(decodeRedeemed(redeemed).kind).toBe("campaign");
    expect(() =>
      decodePreview({
        kind: "campaign",
        groupName: "hidden",
        ownerName: "Ada",
        campaignName: "The Salt Road",
        expiresAt: "2026-09-23T12:00:00.000Z",
      }),
    ).toThrow();
    expect(() =>
      decodeRedeemed({
        kind: "campaign",
        groupId: "2b1f2a1e-0000-4000-8000-00000000a002",
        groupName: "hidden",
        campaignId: null,
        campaignName: null,
        shared: false,
      }),
    ).toThrow();
  });

  it("puts every campaign-scoped endpoint behind Authorization", () => {
    // The fail-closed guard for the transport: an API group added without
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

  /**
   * `GET /me` answers who is asking, and the guarantee that it cannot answer
   * about anybody else is a property of the declaration rather than of the
   * handler behind it.
   *
   * A path parameter, a query parameter or a payload would each be a place for
   * a caller to name an account, and none of the three exists: the account is
   * `CurrentActor`'s, resolved by the API group's middleware from the bearer token.
   * That is the same argument the `me` group makes about `updateCharacter` —
   * *it names no campaign, so there is none for a caller to claim* — with one
   * fewer thing to claim. Other people's identities are `members.list`, which
   * is behind the `DmActor` gate for exactly that reason.
   */
  it("gives `me.identity` nothing a caller could name an account with", () => {
    const me = groups.find((group) => group.identifier === "me");
    const identity = endpointsOf(me as GroupShape).find(
      (endpoint) => endpoint.identifier === "identity",
    );

    expect(identity?.method).toBe("GET");
    expect(identity?.path).toBe("/me");
    expect(identity?.params).toBeUndefined();
    expect(identity?.query).toBeUndefined();
    // And it is not a lookup wearing another name, which is a property of the
    // *whole group* rather than of this one endpoint: **nothing here takes a
    // path that names an account.**
    //
    // Asserted as the path shape rather than as "only one endpoint has params",
    // because that weaker form has already been outgrown twice. Six endpoints
    // take a parameter now — a character of the caller's own, five times, and
    // the campaign a new one goes into, which an insert has no row to derive.
    // None of the six is an account, and an `:accountId` appearing under `/me`
    // would be the second answer to `members.list` that this test exists to
    // prevent, whether or not it arrived alone.
    const parameterised = endpointsOf(me as GroupShape).filter(
      (endpoint) => endpoint.params !== undefined,
    );
    expect(parameterised.map((endpoint) => endpoint.identifier).sort()).toEqual([
      "characterSpells",
      "createCharacter",
      "deleteCharacter",
      "restCharacter",
      "spendCharacterResource",
      "updateCharacter",
    ]);
    expect(parameterised.map((endpoint) => endpoint.path).sort()).toEqual([
      "/me/campaigns/:campaignId/characters",
      "/me/characters/:characterId",
      "/me/characters/:characterId",
      "/me/characters/:characterId/rest",
      "/me/characters/:characterId/spells",
      "/me/characters/:characterId/spend",
    ]);
  });

  it("keeps the Shared World roster informational", () => {
    const worldMembers = groups.find((group) => group.identifier === "sharedWorldMembers");

    expect(
      endpointsOf(worldMembers as GroupShape).map(({ identifier, method, path }) => ({
        identifier,
        method,
        path,
      })),
    ).toEqual([
      {
        identifier: "list",
        method: "GET",
        path: "/worlds/:worldId/members",
      },
    ]);
  });

  it("uses Shared World names and URLs for every world-facing API group", () => {
    const worldGroups = groups.filter((group) => group.identifier.startsWith("sharedWorld"));

    expect(worldGroups.map((group) => group.identifier).sort()).toEqual([
      "sharedWorldHistory",
      "sharedWorldHob",
      "sharedWorldLibrary",
      "sharedWorldMembers",
      "sharedWorlds",
    ]);
    expect(
      worldGroups.flatMap(endpointsOf).every((endpoint) => endpoint.path.startsWith("/worlds")),
    ).toBe(true);
    expect(
      groups.flatMap(endpointsOf).some((endpoint) => endpoint.path.startsWith("/groups")),
    ).toBe(false);
  });

  it("declares the API groups the product has today, and no more", () => {
    expect(groups.map((group) => group.identifier).sort()).toEqual([
      "beats",
      "campaignInvites",
      "campaigns",
      "combatants",
      // The creatures a campaign can *use* — the encounter picker's read, plus
      // the by-id resolution of internal instances. The campaign-copy
      // management endpoints (create/update/remove/derive) are gone: campaign
      // instances are plumbing `encounterCreatures.create` materialises at the
      // point of use (captain's decision, 2026-09-02).
      "creatures",
      "encounterCreatures",
      "encounters",
      "health",
      "hob",
      "invitePreview",
      "join",
      // The Library: where every corpus original is authored and managed, read
      // with no campaign in the path. The campaign-scoped spells / equipment /
      // magic-items / compendium / feats groups are gone with the copy model —
      // those corpora have no per-campaign consumer, so the Library is their
      // whole surface now.
      "library",
      "live",
      "me",
      "members",
      "notes",
      // The campaign's cast and the creator's rehearsal with each NPC —
      // creator-only in every endpoint (the NPC builder decisions of 2026-09-04).
      "npcs",
      // A campaign's rules vocabulary: the classes, races and backgrounds a
      // character at that table is built from. Campaign-scoped because the
      // group-share disjunct needs a campaign to resolve through — and the one
      // list in the product a *player* reads to fill in a picker.
      "options",
      // The party: the seats at one campaign's table, each a join to a shared
      // account-owned character. It replaced the campaign-scoped `characters`
      // group when the continuity decision made the character top-level.
      "party",
      "prep",
      "recap",
      "rolls",
      "runs",
      "search",
      "sessions",
      // Shared Worlds are the explicit cross-campaign context. Their history,
      // Library grants, informational roster and Hob conversation each keep a
      // separate authorization boundary under the same `/worlds` namespace.
      "sharedWorldHistory",
      "sharedWorldHob",
      "sharedWorldLibrary",
      "sharedWorldMembers",
      "sharedWorlds",
      // What is live at one table, to a player: the read behind the character
      // sheet's banner. Its own group for the reason `recap` is one — it is
      // neither a session nor a run, and its answer is narrower than either.
      "table",
    ]);
  });
});

describe("every content schema", () => {
  const contentSchemas = {
    Beat,
    Campaign,
    Session,
    // The seat, not the character: under the continuity decision the shared
    // `Character` deliberately has no `visibility` — who at a *table* may see
    // it is the seat's question, and the seat carries the whole tail. The
    // character's own deliberate shape is pinned in its own test below.
    CampaignCharacter,
    Note,
    Npc,
    Encounter,
    PrepItem,
    Creature,
    Spell,
    Equipment,
    MagicItem,
    RuleArticle,
    EncounterCreature,
    EncounterRun,
    Combatant,
    Roll,
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

  it("gives the shared character provenance and a version, and no visibility", () => {
    // The continuity decision's wire shape: a character is account-owned and
    // campaign-scoped nowhere, so a `visibility` here would be a question with
    // no table in it. The seat (`CampaignCharacter`) is where that column
    // lives; the character keeps provenance — Hob can draft one — and carries
    // the optimistic-concurrency `version` every write bumps.
    const fields = Object.keys(Character.fields);
    expect(fields).toContain("origin");
    expect(fields).toContain("assistantTurnId");
    expect(fields).toContain("version");
    expect(fields).not.toContain("visibility");
    expect(fields).not.toContain("campaignId");
  });

  it("leaves visibility optional on create, so the column default decides", () => {
    // The `dm` default is stated once, in the migration. A create payload that
    // required a visibility would move that decision to every caller.
    const creates = {
      CampaignCreate,
      SessionCreate,
      CharacterOwnCreate,
      // The seat's create: no visibility field at all, so the `dm` default is
      // the only possible answer — the strongest form of this test's property.
      PartyJoin,
      NoteCreate,
      NpcCreate,
      EncounterCreate,
      PrepItemCreate,
      CreatureCreate,
      SpellCreate,
      EquipmentCreate,
      MagicItemCreate,
      RuleArticleLibraryCreate,
      EncounterCreatureCreate,
      EncounterRunStart,
      CombatantCreate,
      RollCreate,
      BeatCreate,
    };
    // The minimum a create needs, per schema. Spelled out rather than merged
    // into one wide object, so a payload that stopped requiring a field would
    // show up here rather than being silently over-supplied.
    const minimal: Record<string, Record<string, unknown>> = {
      CampaignCreate: { name: "x" },
      SessionCreate: { number: 1, title: "t" },
      CharacterOwnCreate: { name: "x" },
      PartyJoin: { characterId: "2b1f2a1e-0000-4000-8000-00000000c0de" },
      NoteCreate: { title: "x" },
      NpcCreate: { name: "x" },
      EncounterCreate: { name: "x" },
      PrepItemCreate: { label: "x" },
      CreatureCreate: { name: "x", type: "Humanoid", cr: "1/4", ac: 15, hp: 11 },
      SpellCreate: {
        name: "x",
        level: 0,
        school: { index: "evocation", name: "Evocation" },
        castingTime: "1 action",
        range: "Self",
        duration: "Instantaneous",
      },
      EquipmentCreate: {
        name: "x",
        equipmentCategory: { index: "adventuring-gear", name: "Adventuring Gear" },
        cost: { quantity: 1, unit: "gp" },
      },
      MagicItemCreate: {
        name: "x",
        equipmentCategory: { index: "wondrous-items", name: "Wondrous Items" },
        rarity: { index: "common", name: "Common" },
      },
      RuleArticleLibraryCreate: { name: "x" },
      EncounterCreatureCreate: { creatureId: "2b1f2a1e-0000-4000-8000-00000000c0de" },
      EncounterRunStart: { encounterId: "2b1f2a1e-0000-4000-8000-00000000c0de" },
      CombatantCreate: { displayName: "x" },
      RollCreate: {
        label: "Shortsword",
        notation: "1d6+3",
        dice: [4],
        kept: [4],
        modifier: 3,
        total: 7,
        mode: "normal",
      },
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
