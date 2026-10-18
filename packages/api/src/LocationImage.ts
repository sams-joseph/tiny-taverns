import { HOUSE_ATLAS_STYLE, HOUSE_COVER_STYLE } from "./HouseStyle.js";
import {
  LOCATION_APPEARANCE_MAX,
  LOCATION_DESCRIPTION_MAX,
  LOCATION_NAME_MAX,
  type LocationKind,
} from "./Location.js";

/**
 * ## What a place's picture is drawn from
 *
 * One pure builder, so the server's draw and its tests read the same words.
 *
 * - **The kind decides the framing.** A realm, a region, a wilderness, a
 *   settlement, a district or a dungeon is a **map** seen from above at the
 *   scale of the whole place (`HOUSE_ATLAS_STYLE`), the picture the places
 *   inside it are pinned on. A landmark or a building is a **scene**, a wide
 *   view of the place itself (`HOUSE_COVER_STYLE`).
 * - **The appearance line leads** when there is one: it is the line written to
 *   be drawn from. Without it the description stands in, as what a visitor
 *   finds there.
 * - **The name colours it**, shown rather than written: no text is drawn.
 * - **The places already inside it**, by kind and count, never by name, so a
 *   town drawn with three districts leaves room for three.
 * - **Guided**, when the places inside it are pinned: the request carries a
 *   layout sketch with a mark at each pin (`ImageModel.edit`), and the prompt
 *   says the marks are where the sites stand and that none of them may show.
 *
 * The owner's notes never go in: they are the one field no other reader sees.
 */

/** The kinds drawn as a map rather than a scene. */
const MAPPED: ReadonlySet<LocationKind> = new Set([
  "realm",
  "region",
  "wilderness",
  "city",
  "town",
  "village",
  "district",
  "dungeon",
]);

/** Whether a place of this kind is drawn as a map its children are pinned on. */
export const locationIsMapped = (kind: LocationKind): boolean => MAPPED.has(kind);

/** What each kind of map is, at its scale. */
const MAP_OF: Readonly<Record<LocationKind, string>> = {
  realm: "a whole realm: coasts, mountain ranges, forests and rivers, its cities small clusters",
  region: "a region: its hills, woods, rivers and roads, its towns small clusters",
  wilderness: "a wild land: its terrain, water and paths, and the few sites in it",
  city: "a whole city from above: its walls, districts, streets, squares and waterfront",
  town: "a whole town from above: its streets, squares, landmarks and edges",
  village: "a village from above: its houses, lanes, fields and the land around it",
  district: "one district of a city from above: its streets, yards and buildings",
  dungeon: "a dungeon's floor plan from above: its chambers, passages and stairs",
  landmark: "a landmark",
  building: "a building",
};

const SCENE_OF: Readonly<Record<LocationKind, string>> = {
  ...MAP_OF,
  landmark: "a landmark, seen whole in its surroundings",
  building: "a building, seen whole from outside in its street or setting",
};

/** The parts of a place its picture reads. */
export interface LocationImageSubject {
  readonly kind: LocationKind;
  readonly name: string;
  readonly description: string | null;
  readonly appearance: string | null;
  /** The kinds of the places directly inside it, one entry per place. */
  readonly childKinds: ReadonlyArray<LocationKind>;
  /** Whether a layout sketch of the pinned places inside it goes with the prompt. */
  readonly guided?: boolean;
}

const clean = (text: string | null | undefined, max: number): string | undefined => {
  const trimmed = (text ?? "")
    .replace(/\s+/g, " ")
    .replace(/["“”]/g, "")
    .trim();
  return trimmed === "" ? undefined : trimmed.slice(0, max).trim();
};

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

const KIND_WORDS: Readonly<Record<LocationKind, readonly [string, string]>> = {
  realm: ["realm", "realms"],
  region: ["region", "regions"],
  wilderness: ["wild land", "wild lands"],
  city: ["city", "cities"],
  town: ["town", "towns"],
  village: ["village", "villages"],
  district: ["district", "districts"],
  dungeon: ["dungeon", "dungeons"],
  landmark: ["landmark", "landmarks"],
  building: ["building", "buildings"],
};

/** Whether there is anything to draw: a name, a description or an appearance line. */
export const locationImageHasSubject = (subject: LocationImageSubject): boolean =>
  clean(subject.appearance, LOCATION_APPEARANCE_MAX) !== undefined ||
  clean(subject.description, LOCATION_DESCRIPTION_MAX) !== undefined ||
  clean(subject.name, LOCATION_NAME_MAX) !== undefined;

export const locationImagePromptFor = (subject: LocationImageSubject): string => {
  const mapped = locationIsMapped(subject.kind);
  const look =
    clean(subject.appearance, LOCATION_APPEARANCE_MAX) ??
    clean(subject.description, LOCATION_DESCRIPTION_MAX);
  const name = clean(subject.name, LOCATION_NAME_MAX);
  const counts = new Map<LocationKind, number>();
  for (const kind of subject.childKinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const inside = [...counts]
    .map(([kind, count]) =>
      count === 1 ? `a ${KIND_WORDS[kind][0]}` : `${String(count)} ${KIND_WORDS[kind][1]}`,
    )
    .join(", ");
  return [
    mapped
      ? `A map for a tabletop roleplaying game of ${MAP_OF[subject.kind]}.`
      : `A picture for a tabletop roleplaying game of ${SCENE_OF[subject.kind]}.`,
    look === undefined ? undefined : sentence(look),
    name === undefined
      ? undefined
      : `It is called ${name}; let the name shape the place, shown rather than written.`,
    mapped && inside !== "" ? `Leave clear room for the sites within it: ${inside}.` : undefined,
    subject.guided === true
      ? "The picture given with this request is a layout sketch: each pale round mark is where one of the sites within it stands. Draw each site in its mark's place, as its kind suggests, over the land around it, and leave no mark, circle or trace of the sketch in the picture."
      : undefined,
    mapped ? HOUSE_ATLAS_STYLE : HOUSE_COVER_STYLE,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
};
