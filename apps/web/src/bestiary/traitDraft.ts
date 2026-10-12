import type { ActionArea, AreaShape, Trait } from "@taverns/api";

/**
 * A trait as it is being typed in the creature form: `name` may still be blank,
 * which the wire refuses, and every distance is the text in its box.
 *
 * The distances are the typed half of what the SRD import reads out of prose
 * (`StatBlock`'s `reach`, `range` and `area`): the runner measures them, so a
 * creature written by hand has the same targets as an imported one when its
 * author says how far it reaches. A box left blank is no distance, never zero.
 *
 * `source` is the trait as it was loaded, so what the form does not show
 * (`hit`, `note`) is carried through an edit rather than lost to it.
 */
export interface DraftTrait {
  readonly key: string;
  readonly source: Trait | undefined;
  readonly name: string;
  readonly text: string;
  readonly dice: string;
  readonly reach: string;
  readonly rangeNormal: string;
  readonly rangeLong: string;
  readonly areaShape: AreaShape | "none";
  readonly areaFeet: string;
  readonly areaWidth: string;
  readonly areaOrigin: ActionArea["origin"];
}

const text = (value: number | undefined): string => (value === undefined ? "" : String(value));

export const draftOf = (trait: Trait, key: string): DraftTrait => ({
  key,
  source: trait,
  name: trait.name,
  text: trait.text,
  dice: trait.dice ?? "",
  reach: text(trait.reach),
  rangeNormal: text(trait.range?.normal),
  rangeLong: text(trait.range?.long),
  areaShape: trait.area?.shape ?? "none",
  areaFeet: text(trait.area?.feet),
  areaWidth: text(trait.area?.width),
  areaOrigin: trait.area?.origin ?? "self",
});

export const blankDraft = (key: string): DraftTrait => draftOf({ name: "", text: "" }, key);

/** The biggest distance a stat block may carry (`Creature.ts`, `actionFeet`). */
const MAX_FEET = 10_000;

type Feet = { readonly feet: number | undefined } | { readonly problem: string };

const feetOf = (raw: string, what: string): Feet => {
  const trimmed = raw.trim();
  if (trimmed === "") return { feet: undefined };
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 && value <= MAX_FEET
    ? { feet: value }
    : { problem: `${what} is a whole number of feet.` };
};

/**
 * The trait the draft says, or why it cannot be sent. A draft with no name is
 * `undefined`: an empty row is somebody who pressed *Add a trait* and changed
 * their mind, dropped rather than refused.
 */
export const traitOf = (
  draft: DraftTrait,
): { readonly trait: Trait | undefined } | { readonly problem: string } => {
  const name = draft.name.trim();
  if (name === "") return { trait: undefined };

  const parsed = {
    reach: feetOf(draft.reach, "Reach"),
    normal: feetOf(draft.rangeNormal, "Range"),
    long: feetOf(draft.rangeLong, "Long range"),
    feet: feetOf(draft.areaFeet, "An area's size"),
    width: feetOf(draft.areaWidth, "A line's width"),
  };
  const refused = Object.values(parsed).find((entry) => "problem" in entry);
  if (refused !== undefined && "problem" in refused) return refused;
  const feetIn = (entry: Feet): number | undefined => ("feet" in entry ? entry.feet : undefined);
  const reach = feetIn(parsed.reach);
  const normal = feetIn(parsed.normal);
  const long = feetIn(parsed.long);
  const feet = feetIn(parsed.feet);
  const width = feetIn(parsed.width);

  if (long !== undefined && normal === undefined)
    return { problem: "A long range needs a normal range before it." };
  if (long !== undefined && normal !== undefined && long < normal)
    return { problem: "The long range is the farther one." };
  if (draft.areaShape !== "none" && feet === undefined)
    return { problem: "Say how big the area is, in feet." };
  if (draft.areaShape !== "none" && draft.areaOrigin === "point" && normal === undefined)
    return { problem: "An area placed at a point needs the range it can be placed within." };

  // What the form does not show stays as it was; what it does is replaced,
  // and a cleared box removes its key rather than sending an empty one.
  const {
    dice: _dice,
    reach: _reach,
    range: _range,
    area: _area,
    ...kept
  } = draft.source ?? { name, text: "" };
  const dice = draft.dice.trim();
  return {
    trait: {
      ...kept,
      name,
      text: draft.text.trim(),
      ...(dice === "" ? {} : { dice }),
      ...(reach === undefined ? {} : { reach }),
      ...(normal === undefined
        ? {}
        : {
            range: { normal, ...(long === undefined ? {} : { long }) },
          }),
      ...(draft.areaShape === "none" || feet === undefined
        ? {}
        : {
            area: {
              shape: draft.areaShape,
              feet,
              ...(draft.areaShape === "line" && width !== undefined ? { width } : {}),
              origin: draft.areaOrigin,
            },
          }),
    },
  };
};
