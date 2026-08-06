import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";
import { Button, Icon, type IconName } from "@taverns/ui";
import type { ReactNode } from "react";
import { SignInSurface } from "../auth/SignInSurface";
import { hrefFor, type Route } from "../routes";

/**
 * The fixed shell: a persistent left rail, a sticky top bar, a scrolling body.
 *
 * This is `ui_kits/dm-screen/AppShell.jsx` built out of the shipped components
 * and the theme's names — the prototype's inline styles and hand-rolled hover
 * state are the visual specification, not code to carry across. The rail never
 * collapses (readme.md, "Spacing & layout"), so it is `w-rail` at every width
 * and the body is what scrolls.
 *
 * Each screen composes this itself and supplies its own top bar, rather than
 * the shell reaching down for a title it would have to be told about anyway.
 */

interface NavItem {
  readonly label: string;
  readonly icon: IconName;
  readonly route: Route;
}

const NAV: ReadonlyArray<NavItem> = [
  { label: "Campaigns", icon: "book-open", route: { screen: "campaigns" } },
  { label: "Components", icon: "panel-left", route: { screen: "gallery" } },
];

/**
 * The rail's nav rows.
 *
 * Real `<a href="#/…">` elements behind `Button variant="ghost"`, so a route is
 * middle-clickable and copyable — the shipped Button's `render` prop is exactly
 * for this, and it keeps the hover wash and focus ring the system already
 * defines rather than restating them.
 */
function RailItem({ item, active }: { readonly item: NavItem; readonly active: boolean }) {
  return (
    <Button
      variant="ghost"
      size="lg"
      aria-current={active ? "page" : undefined}
      // The rendered element is an <a>, so Base UI must not assume native button
      // semantics — without this it warns and applies button-only behaviour.
      nativeButton={false}
      className={
        active
          ? "w-full justify-start gap-2.5 px-2.5 text-on-dark bg-surface-raised"
          : "w-full justify-start gap-2.5 px-2.5 text-on-dark-muted"
      }
      render={<a href={hrefFor(item.route)} />}
    >
      <Icon name={item.icon} size={17} className={active ? "text-verdigris-300" : undefined} />
      {item.label}
    </Button>
  );
}

function Rail({ route, footer }: { readonly route: Route; readonly footer?: ReactNode }) {
  return (
    <nav
      aria-label="Sections"
      className="flex w-rail shrink-0 flex-col border-r border-hairline bg-surface-card"
    >
      <div className="px-3.5 pt-4.5 pb-4">
        <div className="flex items-center gap-2.5">
          <img src={markUrl} alt="" aria-hidden="true" width={30} height={30} className="block" />
          <span className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
            Tiny Taverns
          </span>
        </div>
        <p className="mt-1.5 ml-10 text-label-s leading-body text-verdigris-300">
          The DM&rsquo;s side kick
        </p>
      </div>

      <div className="flex flex-col gap-1 px-2.5">
        {NAV.map((item) => (
          <RailItem key={item.label} item={item} active={item.route.screen === route.screen} />
        ))}
      </div>

      {footer !== undefined && (
        <div className="mt-auto border-t border-hairline p-3.5">{footer}</div>
      )}
    </nav>
  );
}

/**
 * The sticky header: what you are looking at, and what you can do to it.
 *
 * `--fs-display-m` at `--ls-display` — the one display-sized thing on the
 * screen, so the eye lands on the campaign name before the cards.
 *
 * `z-chrome` is the bottom rung of the layering scale in `@taverns/ui`'s
 * `styles.css`: sticky page furniture, deliberately far below the overlay band
 * so a dialog's scrim covers it. Reach for a rung, never a number.
 */
export function TopBar({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-chrome flex items-center gap-gutter border-b border-hairline bg-surface-card px-page-sm py-3.5 sm:px-page">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-display-m leading-tight font-semibold tracking-display text-heading">
          {title}
        </h1>
        {subtitle !== undefined && (
          <p className="mt-1 text-body-s leading-body text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        {children}
        {/* Clerk's own components, unthemed on purpose — see SignInSurface.
            Renders nothing at all when no publishable key is configured, which
            is why every screen can carry it unconditionally. */}
        <SignInSurface />
      </div>
    </header>
  );
}

export function AppShell({
  route,
  railFooter,
  topBar,
  children,
}: {
  readonly route: Route;
  readonly railFooter?: ReactNode;
  readonly topBar: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Rail route={route} footer={railFooter} />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-auto">
        {topBar}
        <main className="flex-1 px-page-sm py-page sm:px-page">{children}</main>
      </div>
    </div>
  );
}
