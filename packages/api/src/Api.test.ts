import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { Authorization } from "./Actor.js";
import { TavernsApi } from "./Api.js";
import { Campaign, CampaignCreate } from "./Campaign.js";
import { Character, CharacterCreate } from "./Character.js";
import { CampaignId } from "./Ids.js";
import { Note, NoteCreate } from "./Note.js";
import { Session, SessionCreate } from "./Session.js";

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

    expect(unauthenticated).toEqual(["health.check"]);
  });

  it("declares the groups the product has today, and no more", () => {
    expect(groups.map((group) => group.identifier).sort()).toEqual([
      "campaigns",
      "characters",
      "health",
      "notes",
      "sessions",
    ]);
  });
});

describe("every content schema", () => {
  const contentSchemas = { Campaign, Session, Character, Note };

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
    const creates = { CampaignCreate, SessionCreate, CharacterCreate, NoteCreate };

    for (const [name, schema] of Object.entries(creates)) {
      const decoded = Schema.decodeUnknownSync(schema)(
        name === "SessionCreate" ? { number: 1, title: "t" } : { name: "x", title: "x" },
      ) as Record<string, unknown>;

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
