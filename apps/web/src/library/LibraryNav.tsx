import { Link, useMatchRoute } from "@tanstack/react-router";
import { cn, tabsTriggerVariants } from "@taverns/ui";

/**
 * The shelves inside the global Library destination.
 *
 * The global row has one *Library* item; the split between monsters and the
 * character-building vocabulary lives one level down, as route tabs. Both
 * routes name no campaign, because both are account-owned originals rather than
 * campaign copies.
 */
export function LibraryNav() {
  const matchRoute = useMatchRoute();
  const active = matchRoute({ to: "/library/rules" }) ? "rules" : "creatures";

  return (
    <nav aria-label="Library shelves" className="flex items-stretch self-stretch">
      <ShelfLink to="/library" active={active === "creatures"}>
        Creatures
      </ShelfLink>
      <ShelfLink to="/library/rules" active={active === "rules"}>
        Rules
      </ShelfLink>
    </nav>
  );
}

function ShelfLink({
  to,
  active,
  children,
}: {
  readonly to: "/library" | "/library/rules";
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
