import { useMatchRoute } from "@tanstack/react-router";
import { TabRow, type Collapse } from "../shell/TabRow";

/**
 * The shelves inside the global Library destination.
 *
 * The global row has one *Library* item; the split between monsters,
 * character-building vocabulary, reference compendium articles, spells, mundane equipment, magic
 * items and reusable NPC sources live one level down, as route tabs. None of these routes names a
 * campaign, because each is account-owned originals rather than campaign copies.
 *
 * Seven shelves do not fit a phone, so the narrow strip keeps the three a table
 * reaches for mid-game and puts the rest in its *More* menu, in the order
 * `collapse` says (`shell/TabRow.tsx`).
 */
type Shelf =
  | "/library"
  | "/library/rules"
  | "/library/compendium"
  | "/library/spells"
  | "/library/equipment"
  | "/library/magic-items"
  | "/library/npcs";

const SHELVES: ReadonlyArray<{
  readonly to: Shelf;
  readonly label: string;
  readonly collapse?: Collapse;
}> = [
  { to: "/library", label: "Creatures" },
  { to: "/library/rules", label: "Rules" },
  { to: "/library/compendium", label: "Compendium", collapse: "xl" },
  { to: "/library/spells", label: "Spells" },
  { to: "/library/equipment", label: "Equipment", collapse: "xl" },
  { to: "/library/magic-items", label: "Magic items", collapse: "2xl" },
  { to: "/library/npcs", label: "NPCs", collapse: "2xl" },
];

export function LibraryNav() {
  const matchRoute = useMatchRoute();
  // `/library` is a prefix of every shelf, so the creatures shelf is what is
  // left when no other shelf matches.
  const active =
    SHELVES.find((shelf) => shelf.to !== "/library" && matchRoute({ to: shelf.to }))?.to ??
    "/library";

  return (
    <TabRow
      label="Library shelves"
      moreLabel="More shelves"
      items={SHELVES.map((shelf) => ({
        key: shelf.to,
        label: shelf.label,
        link: { to: shelf.to },
        active: shelf.to === active,
        ...(shelf.collapse !== undefined && { collapse: shelf.collapse }),
      }))}
    />
  );
}
