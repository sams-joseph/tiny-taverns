import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Card, Icon, type IconName } from "@taverns/ui";
import type { ReactNode } from "react";
import { StartCta, StartCtaNote } from "./StartCta";

/**
 * The homepage — what the product says about itself to somebody who has not
 * signed in.
 *
 * `packages/design-system/ui_kits/marketing/Site.jsx` is the visual
 * specification, built here out of the shipped components and the theme's
 * names, exactly as every other kit screen was. The prototype's inline styles
 * and hand-rolled state are the drawing, not code to carry across.
 *
 * ### It is dark, and the kit's own README is stale about that
 *
 * That README describes a *"dark / light / light / sunken / light / dark"*
 * rhythm. `Site.jsx` itself is fully dark on the current palette and that is
 * the one that is right: **Tiny Taverns is dark only by construction** — the
 * tokens resolve dark at `:root`, there is no `.dark` class to add and
 * `packages/ui/src/adherence.test.ts` fails on a `dark:` utility. What the
 * rhythm survives as is the *surface* stack: page, page, page, card. (The
 * kit's one `sunken` band was the testimonial, which is not on this page —
 * see below.)
 *
 * ### What is drawn here and is not on this page
 *
 * The standing rule — do not render a field the API does not have — applied to
 * links and to claims:
 *
 *  - **The pricing section is gone**, by the captain's decision. It advertised
 *    three plans and two prices for a product with no billing, no plans and no
 *    limits, and one of its features (co-DM seats) is a thing this project has
 *    decided against and has a schema constraint preventing. *Pricing* left the
 *    header nav and the footer with it.
 *  - **The testimonial is gone**, by the captain's decision and for the same
 *    reason the pricing table is: a named person vouching for a product with
 *    no users is a claim this build cannot make. It was the kit's only
 *    `sunken` band, so the surface rhythm above lost a step with it. It comes
 *    back when somebody has actually said it.
 *  - **The email capture is gone**, and `StartCta.tsx` is what replaced it —
 *    read that file for the wrinkle it had to answer.
 *  - **Every link that led nowhere is gone** rather than rendered as dead text:
 *    Bestiary, Changelog, Player view, Status, Contact, Privacy, Getting
 *    started, Keyboard shortcuts, Import a monster, Printable sheets. What is
 *    left is this page's own sections and `#/gallery`, which is a real screen
 *    reachable with no credential.
 *  - **The hero's *v2.4* badge and its "free while your party is under five"
 *    line are gone** for the same reason the pricing table is: there is no
 *    version 2.4 and there is no plan to be under.
 *
 * ### In-page links are `<Link hash>`, never a bare `href="#features"`
 *
 * The app is on a hash history because an invitation token travels in the
 * fragment (`routes.tsx`). A bare fragment therefore *replaces the route* and
 * throws the reader onto the campaign list; `<Link to="/" hash="features">`
 * builds `#/#features`, which the hash history reads as the route `/` with the
 * fragment `features`, and `scrollRestoration` performs the scroll. The gallery
 * is the worked example this copies.
 */

/** Where the page's own sections are, so a link and a heading cannot drift. */
const SECTIONS = {
  features: "features",
  start: "start",
} as const;

/**
 * The header nav, and the whole of what could honestly be in it.
 *
 * Drawn as *Features · Bestiary · Pricing · Changelog*. Pricing went by
 * decision; the bestiary is campaign-scoped and unreachable without one
 * (`creatures.list` hangs off `/campaigns/:campaignId`), and there is no
 * changelog. What is left is this page and the one other screen a signed-out
 * reader may open.
 */
const NAV: ReadonlyArray<{
  readonly label: string;
  readonly hash?: string;
  readonly to?: "/gallery";
}> = [
  { label: "Features", hash: SECTIONS.features },
  { label: "Get started", hash: SECTIONS.start },
  { label: "Components", to: "/gallery" },
];

function Wordmark({ className }: { readonly className?: string }): ReactNode {
  return (
    <span className={`flex items-start gap-2.5 ${className ?? ""}`}>
      <img
        src={markUrl}
        alt=""
        aria-hidden="true"
        width={34}
        height={34}
        className="block h-8.5 w-8.5 shrink-0 rounded-xs"
      />
      <span className="flex flex-col leading-none">
        <span className="font-display text-display-s leading-tight font-semibold tracking-display text-heading">
          Tiny Taverns
        </span>
        <span className="mt-0.5 font-sans text-label leading-snug font-normal text-accent-ink">
          The DM&rsquo;s side kick
        </span>
      </span>
    </span>
  );
}

/**
 * The sticky bar: the only blurred surface on the page, as the kit says.
 *
 * `z-chrome` rather than a number — the layering scale in
 * `packages/ui/src/styles.css` §3 is where every z-index in this product comes
 * from, and sticky page furniture is exactly what that rung is for.
 */
function SiteHeader(): ReactNode {
  return (
    <header className="sticky top-0 z-chrome flex items-center gap-6 border-b border-hairline bg-surface-page/80 px-page-sm py-3.5 backdrop-blur-site-header @3xl:gap-8 @3xl:px-page">
      <Wordmark />
      <nav aria-label="This page" className="hidden items-center gap-6 @3xl:flex">
        {NAV.map((item) => (
          <Link
            key={item.label}
            to={item.to ?? "/"}
            hash={item.hash}
            className="text-body-s leading-none font-medium text-foreground hover:text-heading"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2.5">
        <StartCta size="sm" />
      </div>
    </header>
  );
}

/**
 * The initiative list the hero is built around.
 *
 * **The kit's own note is the reason it exists**: instead of an illustration,
 * the hero shows the product. So this is the runner's row recipe rather than a
 * picture of it — the same `h-row`, the same 3px accent edge on whoever is up,
 * the same mono initiative column and the same semantic colours as
 * `run/InitiativeList.tsx`. Static, because there is no fight behind a homepage;
 * everything else about it is the real thing.
 */
const HERO_ROWS: ReadonlyArray<{
  readonly initiative: string;
  readonly name: string;
  readonly subtitle: string;
  readonly hp: string;
  readonly kind: "pc" | "monster";
  readonly active?: boolean;
}> = [
  {
    initiative: "21",
    name: "Brannoc",
    subtitle: "Level 5 Half-orc Paladin",
    hp: "44/52",
    kind: "pc",
    active: true,
  },
  {
    initiative: "19",
    name: "Goblin Boss",
    subtitle: "Medium humanoid",
    hp: "21/21",
    kind: "monster",
  },
  { initiative: "16", name: "Wren", subtitle: "Level 5 Halfling Rogue", hp: "31/31", kind: "pc" },
  {
    initiative: "14",
    name: "Goblin Archer",
    subtitle: "Small humanoid",
    hp: "4/7",
    kind: "monster",
  },
];

function HeroInitiative(): ReactNode {
  return (
    <Card tone="panel" className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-strong px-3.5 py-2.5">
        <span className="font-display text-body leading-snug font-semibold text-heading">
          Initiative
        </span>
        <Badge>Round 3</Badge>
      </div>

      <div role="table" aria-label="Initiative order">
        {HERO_ROWS.map((row) => (
          <div
            key={row.name}
            role="row"
            className={`flex h-row items-center gap-2.5 border-b border-l-3 border-b-hairline px-2.5 ${
              row.active === true ? "border-l-accent bg-accent-soft" : "border-l-transparent"
            }`}
          >
            <span
              className={`w-6 shrink-0 text-right font-mono text-mono-l leading-none font-bold ${
                row.active === true ? "text-accent-ink" : "text-on-dark-muted"
              }`}
            >
              {row.initiative}
            </span>
            <Icon
              name={row.kind === "pc" ? "shield" : "skull"}
              size={15}
              className={row.kind === "pc" ? "shrink-0 text-info" : "shrink-0 text-danger"}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-s leading-snug font-bold text-on-dark">
                {row.name}
              </span>
              <span className="block truncate text-micro leading-snug text-on-dark-muted">
                {row.subtitle}
              </span>
            </span>
            <span className="shrink-0 font-mono text-mono leading-none font-medium text-on-dark-muted">
              {row.hp}
            </span>
          </div>
        ))}
      </div>

      <p className="border-l-3 border-l-accent bg-accent-soft px-3.5 py-3 font-serif text-body-s leading-loose italic text-heading">
        He is wearing three cloaks, none of them his.
      </p>
    </Card>
  );
}

function Hero(): ReactNode {
  return (
    <section className="relative overflow-hidden bg-surface-page px-page-sm py-14 @3xl:px-page @3xl:pt-24 @3xl:pb-18">
      {/* The one decorative wash on the page: the accent at a whisper, from the
          semantic slot rather than the ramp step it happens to resolve to. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(60%_90%_at_22%_15%,color-mix(in_oklab,var(--color-accent)_14%,transparent),transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-275 items-center gap-10 @4xl:grid-cols-[1.05fr_0.95fr] @4xl:gap-18">
        <div>
          <h1 className="font-display text-display-l leading-tight font-bold tracking-display text-heading @2xl:text-display-xl">
            Run the fight, not the spreadsheet
          </h1>
          <p className="mt-4 max-w-[46ch] text-body-l leading-body text-slate-300">
            Initiative, hit points, stat blocks and the thing you meant to say when they open the
            crate &mdash; all on one screen, all at the speed of the table.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <StartCta size="lg" />
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              className="text-heading"
              render={<Link to="/" hash={SECTIONS.features} />}
            >
              See what it does
            </Button>
          </div>
          <p className="mt-5 flex items-start gap-2 text-caption leading-snug text-on-dark-muted">
            <Icon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
            {/* True of the product as built: a recap is assembled per read from
                the record, and nothing stores a summary. See AGENTS.md, "The
                recap: what it draws from". */}
            Your notes stay yours. Nothing is summarised away and thrown out.
          </p>
        </div>
        <HeroInitiative />
      </div>
    </section>
  );
}

/**
 * Six things the product does, each one of them something it actually does.
 *
 * Three of the kit's six made claims this build cannot: *"every damage line is
 * a button"* (rolling has no endpoint — a rollable trait is drawn as the value
 * it is), *"save your own creatures next to the official ones"* (the bestiary
 * screen is read-only; authoring, importing and deriving are endpoints without
 * screens), and *"share the map"* (there is no map). Each was rewritten onto
 * the shipped behaviour rather than dropped, so the section keeps the shape the
 * kit drew.
 */
const FEATURES: ReadonlyArray<{
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}> = [
  {
    icon: "swords",
    title: "Initiative that keeps up",
    body: "Add a creature mid-fight, take five hit points off one with a number and the Enter key, and nobody waits for you.",
  },
  {
    icon: "scroll-text",
    title: "The stat block is in the fight",
    body: "Select a row and its block is beside the order — the armour class in the DM's own words, the traits, the damage lines.",
  },
  {
    icon: "footprints",
    title: "A bestiary that knows your marsh",
    body: "Search a trait that is in no column, filter by where the party actually is, and read your campaign's creatures beside the shared corpus.",
  },
  {
    icon: "eye-off",
    title: "A player view you control",
    body: "Share a table and your players get the record and their own sheets. A monster's hit points reach them as bloodied, never as a number.",
  },
  {
    icon: "clock",
    title: "Prep in ten minutes",
    body: "A checklist per session, so the thing you meant to remember is on the screen on the night it matters.",
  },
  {
    icon: "moon",
    title: "Dark at the table",
    body: "There is no light mode and there will not be one. The screen does not light up the room you are playing in.",
  },
];

function Features(): ReactNode {
  return (
    <section
      id={SECTIONS.features}
      className="scroll-mt-20 bg-surface-page px-page-sm py-14 @3xl:px-page @3xl:py-18"
    >
      <div className="mx-auto max-w-275">
        <h2 className="max-w-[24ch] font-display text-display-m leading-snug font-semibold tracking-display text-heading @2xl:text-display-l">
          Six things you stop doing by hand
        </h2>
        <div className="mt-8 grid gap-4 @3xl:grid-cols-2 @5xl:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="gap-2.5 p-card">
              <span className="flex size-9 items-center justify-center rounded-sm border border-accent/25 bg-accent-soft text-accent-ink">
                <Icon name={feature.icon} size={19} />
              </span>
              <span className="font-display text-title leading-snug font-semibold tracking-tight text-heading">
                {feature.title}
              </span>
              <p className="text-body-s leading-body text-muted-foreground">{feature.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function Start(): ReactNode {
  return (
    <section
      id={SECTIONS.start}
      className="scroll-mt-20 bg-surface-page px-page-sm py-14 @3xl:px-page @3xl:py-18"
    >
      <div className="mx-auto max-w-155 text-center">
        <h2 className="font-display text-display-m leading-tight font-bold tracking-display text-heading @2xl:text-display-l">
          Next session is Thursday
        </h2>
        <p className="mt-3 text-body-l leading-body text-slate-300">
          Bring your notes; we&rsquo;ll do the arithmetic.
        </p>
        <div className="mt-6 flex justify-center">
          <StartCta size="lg" />
        </div>
        <p className="mt-4 text-caption leading-snug text-on-dark-muted">
          <StartCtaNote />
        </p>
      </div>
    </section>
  );
}

function SiteFooter(): ReactNode {
  return (
    <footer className="border-t border-hairline bg-surface-card px-page-sm pt-10 pb-6 @3xl:px-page">
      <div className="mx-auto grid max-w-275 gap-8 @3xl:grid-cols-[1.3fr_1fr_1fr]">
        <Wordmark />
        <div>
          <div className="mb-3 text-label leading-snug font-medium text-accent-ink">This page</div>
          <div className="flex flex-col gap-2">
            <Link
              to="/"
              hash={SECTIONS.features}
              className="text-body-s leading-snug text-slate-300 hover:text-heading"
            >
              Features
            </Link>
            <Link
              to="/"
              hash={SECTIONS.start}
              className="text-body-s leading-snug text-slate-300 hover:text-heading"
            >
              Get started
            </Link>
          </div>
        </div>
        <div>
          <div className="mb-3 text-label leading-snug font-medium text-accent-ink">The app</div>
          <div className="flex flex-col gap-2">
            <Link
              to="/gallery"
              className="text-body-s leading-snug text-slate-300 hover:text-heading"
            >
              Components
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-8 flex max-w-275 flex-wrap gap-2.5 border-t border-strong pt-4 text-caption leading-snug text-on-dark-muted">
        <span>&copy; 2026 Tiny Taverns</span>
        <span className="@3xl:ml-auto">Made by people who were late to their own session.</span>
      </div>
    </footer>
  );
}

export function MarketingScreen(): ReactNode {
  return (
    // The page is its own container: every measurement below asks whether *this
    // column* fits, which on a standalone page happens to be the window — but
    // asking the container is what keeps the rule the rest of `apps/web` follows
    // (`main` is a `@container`; there is no viewport breakpoint in this app).
    <div className="@container min-h-screen bg-surface-page">
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <Start />
      </main>
      <SiteFooter />
    </div>
  );
}
