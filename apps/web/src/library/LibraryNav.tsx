import { Link, useMatchRoute } from "@tanstack/react-router";
import { cn, tabsTriggerVariants } from "@taverns/ui";

/**
 * The shelves inside the global Library destination.
 *
 * The global row has one *Library* item; the split between monsters,
 * character-building vocabulary, reference compendium articles, spells, mundane equipment and magic
 * items live one level down, as route tabs. None of these routes names a campaign, because each is
 * account-owned originals rather than campaign copies.
 */
export function LibraryNav() {
  const matchRoute = useMatchRoute();
  const active = matchRoute({ to: "/library/rules" })
    ? "rules"
    : matchRoute({ to: "/library/compendium" })
      ? "compendium"
      : matchRoute({ to: "/library/spells" })
        ? "spells"
        : matchRoute({ to: "/library/equipment" })
          ? "equipment"
          : matchRoute({ to: "/library/magic-items" })
            ? "magic-items"
            : "creatures";

  return (
    <nav aria-label="Library shelves" className="flex items-stretch self-stretch">
      <ShelfLink to="/library" active={active === "creatures"}>
        Creatures
      </ShelfLink>
      <ShelfLink to="/library/rules" active={active === "rules"}>
        Rules
      </ShelfLink>
      <ShelfLink to="/library/compendium" active={active === "compendium"}>
        Compendium
      </ShelfLink>
      <ShelfLink to="/library/spells" active={active === "spells"}>
        Spells
      </ShelfLink>
      <ShelfLink to="/library/equipment" active={active === "equipment"}>
        Equipment
      </ShelfLink>
      <ShelfLink to="/library/magic-items" active={active === "magic-items"}>
        Magic items
      </ShelfLink>
    </nav>
  );
}

function ShelfLink({
  to,
  active,
  children,
}: {
  readonly to:
    | "/library"
    | "/library/rules"
    | "/library/compendium"
    | "/library/spells"
    | "/library/equipment"
    | "/library/magic-items";
  readonly active: boolean;
  readonly children: string;
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      activeProps={{}}
      aria-current={active ? "page" : undefined}
      data-active={active ? "" : undefined}
      className={cn(tabsTriggerVariants(), "h-auto self-stretch px-3.25")}
    >
      {children}
    </Link>
  );
}
