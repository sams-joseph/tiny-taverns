import { ServerPanel } from "../api/ServerPanel";
import { Link } from "@tanstack/react-router";
import { AppShell, TopBar } from "../shell/AppShell";
import { Core } from "./Core";
import { Feedback } from "./Feedback";
import { Forms } from "./Forms";
import { HobSection } from "./Hob";
import { Foundations } from "./Foundations";
import { Navigation } from "./Navigation";

const SECTIONS = [
  { id: "foundations", label: "Foundations" },
  { id: "core", label: "Core" },
  { id: "forms", label: "Forms" },
  { id: "navigation", label: "Navigation" },
  { id: "feedback", label: "Feedback" },
  { id: "hob", label: "Hob" },
  { id: "server", label: "Server" },
];

/**
 * The component gallery: every component in the system, in every variant and size,
 * on the surfaces it is meant to sit on. This is the page that proves the
 * foundation works — check it against packages/design-system/guidelines/.
 *
 * It kept its place in the app after the campaign view landed, for one reason
 * beyond the specimens: `ServerPanel` is the only interactive proof that the
 * machine-token credential still authenticates from a browser, and it is where a
 * developer with no hosted sign-in pastes the token the rest of the app reads.
 */
export function Gallery() {
  return (
    <AppShell
      topBar={
        <TopBar
          title="Components"
          subtitle="Every primitive, every variant, every size — real shadcn components on Base UI, styled from the design system's tokens."
        />
      }
    >
      <div className="flex flex-col gap-14">
        <nav aria-label="Specimens" className="flex flex-wrap gap-x-5 gap-y-2">
          {SECTIONS.map((section) => (
            <Link
              key={section.id}
              to="/gallery"
              hash={section.id}
              className="text-label font-medium text-link hover:text-link-hover"
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <Foundations />
        <Core />
        <Forms />
        <Navigation />
        <Feedback />
        <HobSection />
        <ServerPanel />

        <p className="border-t border-hairline pt-6 text-caption text-faint">
          Made by people who were late to their own session.
        </p>
      </div>
    </AppShell>
  );
}
