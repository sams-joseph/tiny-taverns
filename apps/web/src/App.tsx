import markUrl from "@taverns/design-system/assets/icon/mark-on-dark-256.png";

import { Core } from "./gallery/Core";
import { Feedback } from "./gallery/Feedback";
import { Forms } from "./gallery/Forms";
import { Foundations } from "./gallery/Foundations";
import { Navigation } from "./gallery/Navigation";
import { ServerPanel } from "./api/ServerPanel";
import { SignInSurface } from "./auth/SignInSurface";

const SECTIONS = [
  { id: "foundations", label: "Foundations" },
  { id: "core", label: "Core" },
  { id: "forms", label: "Forms" },
  { id: "navigation", label: "Navigation" },
  { id: "feedback", label: "Feedback" },
  { id: "server", label: "Server" },
];

/**
 * The component gallery: every component in the system, in every variant and size,
 * on the surfaces it is meant to sit on. This is the page that proves the
 * foundation works — check it against packages/design-system/guidelines/.
 */
export function App() {
  return (
    <div className="min-h-screen bg-surface-page">
      <header className="border-b border-hairline bg-surface-card">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 px-page-sm py-page sm:px-page">
          <div className="flex flex-wrap items-center gap-3">
            <img src={markUrl} alt="" width={40} height={40} aria-hidden="true" />
            <span className="font-display text-display-m leading-tight font-semibold tracking-display text-heading">
              Tiny Taverns
            </span>
            {/* Clerk's own components, unthemed on purpose — see SignInSurface.
                Renders nothing when no publishable key is configured. */}
            <div className="ml-auto">
              <SignInSurface />
            </div>
          </div>
          <p className="max-w-measure text-body leading-body text-muted-foreground">
            The component gallery. Every primitive, every variant, every size — real shadcn
            components on Base UI primitives, styled from the design system&apos;s tokens. The
            dungeon master&apos;s side kick has no light mode: a DM runs it at a lit table.
          </p>
          <nav aria-label="Sections" className="flex flex-wrap gap-x-5 gap-y-2">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="text-label font-medium text-link hover:text-link-hover"
              >
                {section.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-14 px-page-sm py-page sm:px-page">
        <Foundations />
        <Core />
        <Forms />
        <Navigation />
        <Feedback />
        <ServerPanel />
      </main>

      <footer className="border-t border-hairline bg-surface-sunken">
        <div className="mx-auto max-w-5xl px-page-sm py-page sm:px-page">
          <p className="text-caption text-faint">
            Made by people who were late to their own session.
          </p>
        </div>
      </footer>
    </div>
  );
}
