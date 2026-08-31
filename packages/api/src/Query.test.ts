import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { TavernsApi } from "./Api.js";
import { queryArray } from "./Query.js";

const strings = queryArray(Schema.NonEmptyString);
const decode = Schema.decodeUnknownSync(Schema.Struct({ values: Schema.optional(strings) }));
const encode = Schema.encodeUnknownSync(Schema.Struct({ values: Schema.optional(strings) }));

describe("an array-valued query parameter", () => {
  // The defect, stated as the thing that now works. `UrlParams.toRecord` folds
  // a repeated key into a scalar when it occurs once, so this is the shape a
  // real user meets first — one chip pressed.
  it("decodes a single occurrence, which the wire spells as a scalar", () => {
    expect(decode({ values: "Cave" })).toEqual({ values: ["Cave"] });
  });

  it("decodes several occurrences", () => {
    expect(decode({ values: ["Cave", "River"] })).toEqual({ values: ["Cave", "River"] });
  });

  // An empty array has no occurrences at all: `UrlParams.fromInput` emits no key
  // for it. So "nothing selected" is an absent parameter, never an empty string
  // — which is what lets a repository tell it apart from a filter that matches
  // nothing.
  it("reads no occurrences as an absent filter", () => {
    expect(decode({})).toEqual({});
    expect(encode({ values: [] })).toEqual({ values: [] });
  });

  it("still applies the element's own checks", () => {
    expect(() => decode({ values: "" })).toThrow();
  });

  it("encodes back to an array, which the client spreads into repeated keys", () => {
    expect(encode({ values: ["Cave"] })).toEqual({ values: ["Cave"] });
  });

  // The bug this replaced, pinned so the reason the helper exists stays legible.
  it("is what a bare Schema.Array cannot do", () => {
    const bare = Schema.decodeUnknownSync(
      Schema.Struct({ values: Schema.optional(Schema.Array(Schema.NonEmptyString)) }),
    );
    expect(bare({ values: ["Cave", "River"] })).toEqual({ values: ["Cave", "River"] });
    expect(() => bare({ values: "Cave" })).toThrow();
  });
});

/** Every declared query parameter in the contract, endpoint by endpoint. */
const queryFields = () => {
  interface GroupShape {
    readonly identifier: string;
    readonly endpoints: Record<
      string,
      { readonly identifier: string; readonly query?: { readonly ast: unknown } }
    >;
  }
  const groups = Object.values(TavernsApi.groups) as unknown as ReadonlyArray<GroupShape>;
  return groups.flatMap((group) =>
    Object.values(group.endpoints).flatMap((endpoint) => {
      const ast = endpoint.query?.ast as
        | { readonly propertySignatures?: ReadonlyArray<{ name: string; type: unknown }> }
        | undefined;
      return (ast?.propertySignatures ?? []).map((property) => ({
        endpoint: `${group.identifier}.${endpoint.identifier}`,
        name: property.name,
        type: property.type,
      }));
    }),
  );
};

/** Whether a declared parameter is a list, however it is spelled. */
const isArray = (ast: unknown): boolean => {
  const node = ast as { readonly _tag?: string; readonly types?: ReadonlyArray<unknown> };
  if (node._tag === "Arrays") return true;
  return (node.types ?? []).some(isArray);
};

describe("the query parameters this contract declares", () => {
  // The sweep the array-decoding defect was worth doing: it was found on one
  // parameter and is a property of *every* array-valued one, so this walks the
  // whole API rather than trusting that the one that was reported is the only
  // one. It fails on a bare `Schema.Array` in a `query:` position wherever it
  // is added.
  it("accepts a single occurrence of every list-valued one", () => {
    const arrays = queryFields().filter((field) => isArray(field.type));
    expect(arrays.map((field) => `${field.endpoint}.${field.name}`)).toEqual([
      "creatures.list.environments",
      "creatures.list.sizes",
      "creatures.list.types",
      "creatures.list.subtypes",
      "creatures.list.alignments",
      "creatures.list.damageResistances",
      "creatures.list.damageImmunities",
      "creatures.list.conditionImmunities",
      "creatures.list.movementModes",
      "spells.list.levels",
      "spells.list.schools",
      "spells.list.classes",
      "equipment.list.categories",
      "equipment.list.gearCategories",
      "equipment.list.armorCategories",
      "equipment.list.weaponCategories",
      "equipment.list.weaponRanges",
      "equipment.list.toolCategories",
      "equipment.list.vehicleCategories",
      "equipment.list.properties",
      "magicItems.list.categories",
      "magicItems.list.rarities",
      "magicItems.list.attunement",
      "magicItems.list.variantStates",
      "library.list.environments",
      "library.list.sizes",
      "library.list.types",
      "library.list.subtypes",
      "library.list.alignments",
      "library.list.damageResistances",
      "library.list.damageImmunities",
      "library.list.conditionImmunities",
      "library.list.movementModes",
      "library.spells.levels",
      "library.spells.schools",
      "library.spells.classes",
      "library.equipment.categories",
      "library.equipment.gearCategories",
      "library.equipment.armorCategories",
      "library.equipment.weaponCategories",
      "library.equipment.weaponRanges",
      "library.equipment.toolCategories",
      "library.equipment.vehicleCategories",
      "library.equipment.properties",
      "library.magicItems.categories",
      "library.magicItems.rarities",
      "library.magicItems.attunement",
      "library.magicItems.variantStates",
    ]);
    for (const field of arrays) {
      const field_ = Schema.make(field.type as never) as Schema.Codec<unknown, unknown>;
      const sample =
        field.name === "levels"
          ? "3"
          : field.name === "attunement"
            ? "required"
            : field.name === "variantStates"
              ? "variant"
              : "Cave";
      const expected = [sample];
      const one = Schema.decodeUnknownSync(field_)(sample);
      expect(one, `${field.endpoint}.${field.name}`).toEqual(expected);
    }
  });
});
