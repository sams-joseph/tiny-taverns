import { TabRow } from "../shell/TabRow";
import { SHELVES, useActiveShelf } from "./shelves";

/** The Library's own tab row: one tab per shelf in `shelves.ts`. */
export function LibraryNav() {
  const active = useActiveShelf();

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
