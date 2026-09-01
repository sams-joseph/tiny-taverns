import type { FeatPrerequisiteAbilityInput } from "@taverns/api";

export const FIVE_E_BITS_2014_FEATS_SOURCE =
  "Generated from 5e-bits/5e-database 5.10.0 commit 5a7ee5a0489b26655d343e4a41e8f7942a887af2, src/2014/en/5e-SRD-Feats.json. The pinned upstream file contains exactly one feat: Grappler.";

export interface SystemFeatPrerequisite {
  readonly abilityIndex: string;
  readonly minimumScore: number;
}

export interface SystemFeat {
  readonly sourceIndex: string;
  readonly name: string;
  readonly description: ReadonlyArray<string>;
  readonly prerequisites: ReadonlyArray<SystemFeatPrerequisite>;
  readonly raw: unknown;
}

export const FEAT_RAW = [
  {
    index: "grappler",
    name: "Grappler",
    prerequisites: [
      {
        ability_score: {
          index: "str",
          name: "STR",
          url: "/api/2014/ability-scores/str",
        },
        minimum_score: 13,
      },
    ],
    desc: [
      "You’ve developed the Skills necessary to hold your own in close--quarters Grappling. You gain the following benefits:",
      "- You have advantage on Attack Rolls against a creature you are Grappling.",
      "- You can use your action to try to pin a creature Grappled by you. To do so, make another grapple check. If you succeed, you and the creature are both Restrained until the grapple ends.",
    ],
    url: "/api/2014/feats/grappler",
  },
] as const;

export const SYSTEM_FEATS: ReadonlyArray<SystemFeat> = FEAT_RAW.map((feat) => ({
  sourceIndex: feat.index,
  name: feat.name,
  description: feat.desc,
  prerequisites: feat.prerequisites.map((prerequisite) => ({
    abilityIndex: prerequisite.ability_score.index,
    minimumScore: prerequisite.minimum_score,
  })),
  raw: feat,
}));

export type FeatPrerequisiteSeed = FeatPrerequisiteAbilityInput;
