import { useMatchRoute } from "@tanstack/react-router";
import type { Collapse } from "../shell/TabRow";

/**
 * The shelves inside the global Library destination — **one list, read by both
 * places that name them**: the Library's own tab row (`LibraryNav`) and the
 * *Library* panel on the global row (`shell/AppShell.tsx`). A shelf added here
 * is on both; a shelf added anywhere else is on one, which is the drift this
 * file exists to make impossible.
 *
 * The global row has one *Library* item; the split between monsters,
 * character-building vocabulary, reference compendium articles, spells, mundane
 * equipment, magic items and reusable NPC sources lives one level down. None of
 * these routes names a campaign, because each is account-owned originals rather
 * than campaign copies.
 *
 * Seven shelves do not fit a phone, so the Library's narrow strip keeps the
 * three a table reaches for mid-game and puts the rest in its *More* menu, in
 * the order `collapse` says (`shell/TabRow.tsx`). The global row's panel lists
 * every shelf at every width, each with its `description`: one line on what the
 * shelf holds, which only the panel draws — the tab row is on the shelf already.
 */
export type Shelf =
  | "/library"
  | "/library/rules"
  | "/library/compendium"
  | "/library/spells"
  | "/library/equipment"
  | "/library/magic-items"
  | "/library/npcs";

export const SHELVES: ReadonlyArray<{
  readonly to: Shelf;
  readonly label: string;
  readonly description: string;
  readonly collapse?: Collapse;
}> = [
  {
    to: "/library",
    label: "Creatures",
    description: "Monster stat blocks to build encounters from",
  },
  {
    to: "/library/rules",
    label: "Rules",
    description: "Classes, races, backgrounds and feats for building characters",
  },
  {
    to: "/library/compendium",
    label: "Compendium",
    description: "The rules reference: combat, ability checks, adventuring, spellcasting",
    collapse: "xl",
  },
  {
    to: "/library/spells",
    label: "Spells",
    description: "Every spell, from cantrips to 9th level",
  },
  {
    to: "/library/equipment",
    label: "Equipment",
    description: "Weapons, armour, tools and adventuring gear",
    collapse: "xl",
  },
  {
    to: "/library/magic-items",
    label: "Magic items",
    description: "Wondrous items, magic weapons and armour, potions",
    collapse: "2xl",
  },
  {
    to: "/library/npcs",
    label: "NPCs",
    description: "Reusable characters, with voice and motives, to cast in a campaign",
    collapse: "2xl",
  },
];

/**
 * The shelf this route is on, or `undefined` outside the Library. `/library`
 * is a prefix of every shelf, so the creatures shelf is what is left when no
 * other shelf matches.
 */
export function useActiveShelf(): Shelf | undefined {
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/library", fuzzy: true }) === false) return undefined;
  return (
    SHELVES.find((shelf) => shelf.to !== "/library" && matchRoute({ to: shelf.to }))?.to ??
    "/library"
  );
}
