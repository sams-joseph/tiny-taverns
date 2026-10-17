import { describe, expect, it } from "vitest";
import { attackDelivery, damageTypeOf, spellAttackOf } from "./AttackDelivery.js";

describe("attackDelivery", () => {
  const dagger = { reach: 5, range: { normal: 20, long: 60 } };

  it("is a spell's own attack type, wherever the target stands", () => {
    expect(attackDelivery({ spell: "ranged", range: { normal: 120 } }, "normal")).toBe(
      "ranged-spell",
    );
    expect(attackDelivery({ spell: "melee", range: { normal: 5 } }, "reach")).toBe("melee-spell");
  });

  it("stabs a target within reach and throws at one within range", () => {
    expect(attackDelivery(dagger, "reach")).toBe("melee-weapon");
    expect(attackDelivery(dagger, "normal")).toBe("ranged-weapon");
    expect(attackDelivery(dagger, "long")).toBe("ranged-weapon");
  });

  it("falls back on a line with only one of the two, with no band", () => {
    expect(attackDelivery({ reach: 10 }, undefined)).toBe("melee-weapon");
    expect(attackDelivery({ range: { normal: 80, long: 320 } }, "out")).toBe("ranged-weapon");
  });

  it("says nothing when the line could be either, or neither", () => {
    expect(attackDelivery(dagger, undefined)).toBeUndefined();
    expect(attackDelivery({}, undefined)).toBeUndefined();
  });
});

describe("damageTypeOf", () => {
  it("reads a type as a line writes it", () => {
    expect(damageTypeOf("Fire")).toBe("fire");
    expect(damageTypeOf(" slashing ")).toBe("slashing");
  });

  it("is nothing for prose or no type at all", () => {
    expect(damageTypeOf("fire and ice")).toBeUndefined();
    expect(damageTypeOf(undefined)).toBeUndefined();
    expect(damageTypeOf(null)).toBeUndefined();
  });
});

describe("spellAttackOf", () => {
  it("reads the SRD's attack_type", () => {
    expect(spellAttackOf("ranged")).toBe("ranged");
    expect(spellAttackOf("Melee")).toBe("melee");
    expect(spellAttackOf("touch")).toBeUndefined();
  });
});
