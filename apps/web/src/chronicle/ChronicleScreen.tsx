import type { CampaignId } from "@taverns/api";
import { useParams, useSearch } from "@tanstack/react-router";
import { EmptyState } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { CampaignChrome, type CampaignChromeSlots } from "../campaign/CampaignChrome";
import { ChronicleColumns, JumpTo } from "./ChronicleParts";
import { summaryLine, useOpenNights } from "./nights";
import { loadChronicleSpine, type ChronicleSpine } from "./load";
import { RecapBody } from "./RecapBody";
import { SessionEntry } from "./SessionEntry";

/**
 * The Chronicle — `Campaign Overview.dc.html`'s Chronicle tab against the real
 * API, **the DM's projection.**
 *
 * The nights, newest first, each a card that opens; *Jump to* beside them. The
 * page is centred at the Overview's width, like every campaign destination the
 * redesign draws, and scrolls with the window.
 *
 * ### What the drawing has that this does not, yet
 *
 * Each is a piece of record the product does not hold today, so each is left
 * out rather than stubbed, and each has its place here for when it arrives:
 *
 * - **A night's written summary and its spotlight**, which the closed card
 *   clamps and the opened card leads with. The closed card carries the night's
 *   length in the summary's place (`SessionEntry`).
 * - **The draft card for writing a night up, *Expand all*, the Spotlight
 *   aside, acts and the story so far.** The draft and the story lead the main
 *   column, above the nights; *Expand all* is the header's action; the
 *   Spotlight goes under *Jump to*; acts group the nights.
 * - **Level-ups, loot and who was met.** Nothing records any of them, and the
 *   maintainer chose to leave them out.
 *
 * ### What it no longer carries
 *
 * Search, the fight and scene story cards, the read-alouds, the ticked prep,
 * the *Read aloud* toggle and *Threads still open* are not in the drawing and
 * went with it (the maintainer's call). A played fight's log is still one press
 * from its encounter's own page.
 *
 * ### It wears the campaign's frame
 *
 * `CampaignChrome` answers the campaign, the session badge and the campaign's
 * press; the screen adds only the spine of nights (`loadChronicleSpine`),
 * composed into the frame's one resource as `extra`.
 */

/**
 * The spine of nights, keyed on the campaign. The recaps themselves are
 * `RecapBody`'s own atoms — one per card that is open.
 */
const spineAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(loadChronicleSpine(campaignId), [reads.sessions(campaignId)]),
);

export function ChronicleScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });

  return (
    <CampaignChrome<ChronicleSpine>
      campaignId={campaignId}
      title="Chronicle"
      centred
      extra={spineAtom(campaignId)}
      subtitle={({ extra }) => summaryLine(extra.sessions)}
    >
      {(slots) => <Chronicle slots={slots} />}
    </CampaignChrome>
  );
}

/**
 * The record itself, mounted once the frame has answered — which is what lets
 * `useOpenNights` start from the list and from the night a link named.
 */
function Chronicle({ slots }: { readonly slots: CampaignChromeSlots<ChronicleSpine> }) {
  const { view, extra } = slots;
  const campaignId = view.campaign.id;
  const sessions = extra.sessions;
  const target = useSearch({ strict: false }).session;
  const nights = useOpenNights(sessions, target);

  if (sessions.length === 0) {
    return (
      // The state a new DM sees first, and bounded to the same width as a
      // failure notice — a card the whole width of the page reads as a page
      // that failed to load rather than one with nothing in it yet.
      <div className="max-w-3xl">
        <EmptyState icon="scroll-text" title="Nothing written down yet">
          The chronicle fills itself as you play — every beat you jot and every encounter you run
          lands here under the night it happened on. Start a night from{" "}
          <span className="text-heading">{view.campaign.name}</span> and this page has something to
          say.
        </EmptyState>
      </div>
    );
  }

  return (
    <ChronicleColumns
      main={sessions.map((session) => (
        <SessionEntry
          key={session.id}
          session={session}
          open={nights.isOpen(session.id)}
          onToggle={() => nights.toggle(session.id)}
        >
          <RecapBody campaignId={campaignId} sessionId={session.id} />
        </SessionEntry>
      ))}
      aside={<JumpTo sessions={sessions} onJump={nights.jump} />}
    />
  );
}
