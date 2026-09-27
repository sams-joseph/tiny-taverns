import type { CampaignId } from "@taverns/api";
import { useParams, useSearch } from "@tanstack/react-router";
import { EmptyState } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { CampaignChrome, type CampaignChromeSlots } from "../campaign/CampaignChrome";
import { useMemo } from "react";
import { ChronicleColumns, ExpandAll, JumpTo } from "./ChronicleParts";
import { summaryLine, useLanding, useOpenNights, type OpenNights } from "./nights";
import { loadChronicleSpine, sessionsOf, type ChronicleSpine } from "./load";
import { NightBody } from "./NightBody";
import { SessionEntry } from "./SessionEntry";
import { SpotlightCard } from "./SpotlightCard";

/**
 * The Chronicle — `Campaign Overview.dc.html`'s Chronicle tab against the real
 * API, **the DM's projection.**
 *
 * The nights, newest first, each a card that opens; *Jump to* and the
 * Spotlight beside them and *Expand all* in the header. The page is centred at
 * the Overview's width, like every campaign destination the redesign draws,
 * and scrolls with the window. It reads the whole record once
 * (`loadChronicleSpine`), so a closed card can clamp its night's summary and
 * *Expand all* opens every night without a request per card.
 *
 * ### What the drawing has that this does not, yet
 *
 * - **The draft card for writing a night up, acts and the story so far.** The
 *   draft and the story lead the main column, above the nights; acts group the
 *   nights.
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
 * press; the screen adds only the record (`loadChronicleSpine`), composed into
 * the frame's one resource as `extra`. Which nights are open lives here, above
 * the frame, because the frame draws the header that *Expand all* sits in; the
 * screen reads the same atom the frame does, which is one request, not two.
 */

/**
 * The record, keyed on the campaign. It answers `sessions` (opening or
 * finishing a night, keeping its summary or a beat) and `encounters`, which
 * starting or ending a fight names and which deleting an encounter names when
 * it leaves that encounter's runs with nothing to open.
 */
const spineAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(loadChronicleSpine(campaignId), [
    reads.sessions(campaignId),
    reads.encounters(campaignId),
  ]),
);

export function ChronicleScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
  const target = useSearch({ strict: false }).session;
  const [spine] = useApiAtom(spineAtom(campaignId));
  const sessions = useMemo(
    () => (spine.state === "ready" ? sessionsOf(spine.value.nights) : undefined),
    [spine],
  );
  const nights = useOpenNights(sessions, target);

  return (
    <CampaignChrome<ChronicleSpine>
      campaignId={campaignId}
      title="Chronicle"
      centred
      extra={spineAtom(campaignId)}
      subtitle={({ extra }) => summaryLine(sessionsOf(extra.nights))}
      actions={({ extra }) =>
        extra.nights.length > 0 && (
          <ExpandAll allOpen={nights.allOpen} onToggle={nights.toggleAll} />
        )
      }
    >
      {(slots) => <Chronicle slots={slots} nights={nights} />}
    </CampaignChrome>
  );
}

/** The record itself, once the frame has answered. */
function Chronicle({
  slots,
  nights: open,
}: {
  readonly slots: CampaignChromeSlots<ChronicleSpine>;
  readonly nights: OpenNights;
}) {
  const { view, extra } = slots;
  const campaignId = view.campaign.id;
  const nights = extra.nights;
  const sessions = useMemo(() => sessionsOf(nights), [nights]);
  useLanding(open, sessions);

  if (nights.length === 0) {
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
      main={nights.map((night) => (
        <SessionEntry
          key={night.session.id}
          session={night.session}
          open={open.isOpen(night.session.id)}
          onToggle={() => open.toggle(night.session.id)}
        >
          <NightBody audience={{ kind: "dm", campaignId }} night={night} />
        </SessionEntry>
      ))}
      aside={
        <>
          <JumpTo sessions={sessions} onJump={open.jump} />
          <SpotlightCard party={view.party} sessions={sessions} />
        </>
      }
    />
  );
}
