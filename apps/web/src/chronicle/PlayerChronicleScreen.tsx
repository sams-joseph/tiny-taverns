import type { CampaignId } from "@taverns/api";
import { useSearch } from "@tanstack/react-router";
import { EmptyState, Loading } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { TopBar } from "../shell/TopBar";
import { ChronicleColumns, JumpTo } from "./ChronicleParts";
import { summaryLine, useOpenNights } from "./nights";
import { loadPlayerChronicle, type PlayerChronicleView } from "./load";
import { PlayerRecapBody } from "./PlayerRecapBody";
import { SessionEntry } from "./SessionEntry";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * The record of a table you sit at.
 *
 * **The DM's Chronicle, seen through the narrower projection**: the same night
 * card, the same columns and the same *Jump to* (`SessionEntry`,
 * `ChronicleParts.tsx`); what differs is the endpoint each open card reads
 * (`PlayerRecapBody`) and therefore what a night may say.
 *
 * ### Why this is the safe record screen
 *
 * A mistake here is a blank page, not a disclosure, and that property is bought
 * rather than hoped for: `sessions.list` answers a player only the nights their
 * DM shared, and `recap.readAsPlayer` answers only the beats they shared and a
 * neutral name for any encounter that is not Shared and Ready. So every read on
 * this screen is one a player may make, and widening it would take a change on
 * the server — not a forgotten flag here.
 *
 * ### What it deliberately does not carry
 *
 * The DM-only box (its beats are not in this read at all), and a link on an
 * encounter chip: the encounter's page is the creator's.
 */

/**
 * The spine of nights a player may read, keyed on the campaign. The recaps
 * themselves are `PlayerRecapBody`'s own atoms — one per card that is open.
 */
const playerChronicleAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(loadPlayerChronicle(campaignId), [
    reads.campaign(campaignId),
    reads.sessions(campaignId),
  ]),
);

export function PlayerChronicleScreen({ campaignId }: { readonly campaignId: CampaignId }) {
  const [resource, reload] = useApiAtom(playerChronicleAtom(campaignId));
  const view = resource.state === "ready" ? resource.value : undefined;

  return (
    // The campaign destinations' frame: centred at the Overview's width,
    // header included, so its left edge is the nights'.
    <div className="mx-auto w-full max-w-overview">
      <TopBar
        title="Chronicle"
        subtitle={view === undefined ? undefined : summaryLine(view.sessions, " shared with you")}
      />
      {resource.state === "loading" && <Loading label="Opening the chronicle…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {view !== undefined && <PlayerChronicle campaignId={campaignId} view={view} />}
    </div>
  );
}

function PlayerChronicle({
  campaignId,
  view,
}: {
  readonly campaignId: CampaignId;
  readonly view: PlayerChronicleView;
}) {
  const sessions = view.sessions;
  const target = useSearch({ strict: false }).session;
  const nights = useOpenNights(sessions, target);

  if (sessions.length === 0) {
    return (
      // What somebody who joined last night sees, and the ordinary outcome
      // rather than an error: sessions start `dm`, so a table with a record
      // ten nights long has nothing here until its DM shares one. It names the
      // person who decides, because otherwise the page reads as broken.
      <div className="max-w-3xl">
        <EmptyState icon="scroll-text" title="No nights shared yet">
          Your DM decides which nights the table can read back. When they share one, it appears here
          — the moments they kept and the encounters you played. Nothing is missing from{" "}
          <span className="text-heading">{view.campaign.name}</span>; it just has not been shared
          with you.
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
          <PlayerRecapBody campaignId={campaignId} sessionId={session.id} />
        </SessionEntry>
      ))}
      aside={<JumpTo sessions={sessions} onJump={nights.jump} />}
    />
  );
}
