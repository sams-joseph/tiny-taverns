import type { CampaignId } from "@taverns/api";
import { useSearch } from "@tanstack/react-router";
import { EmptyState, Loading } from "@taverns/ui";
import { Atom } from "effect/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { TopBar } from "../shell/TopBar";
import { useMemo } from "react";
import { groupByAct } from "./acts";
import { ActSections, ChronicleColumns, ExpandAll, JumpTo } from "./ChronicleParts";
import { spotlightName } from "./entry";
import { summaryLine, useLanding, useOpenNights, type OpenNights } from "./nights";
import { loadPlayerChronicle, sessionsOf, type PlayerChronicleView } from "./load";
import { NightBody } from "./NightBody";
import { SessionEntry } from "./SessionEntry";
import { PlayerStoryCard } from "./StoryCard";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * The record of a table you sit at.
 *
 * **The DM's Chronicle, seen through the narrower projection**: the same night
 * card, body, columns, *Jump to* and *Expand all* (`SessionEntry`, `NightBody`,
 * `ChronicleParts.tsx`); what differs is the endpoint the record is read from
 * (`chronicle.readAsPlayer`) and therefore what a night may say.
 *
 * ### Why this is the safe record screen
 *
 * A mistake here is a blank page, not a disclosure, and that property is bought
 * rather than hoped for: `chronicle.readAsPlayer` answers a player only the
 * nights their DM shared, on them only the beats they shared, and a neutral
 * name for any encounter that is not Shared and Ready. So every read on
 * this screen is one a player may make, and widening it would take a change on
 * the server — not a forgotten flag here.
 *
 * ### What a shared night says
 *
 * Its title when the DM typed one, its date, the DM's summary and whose night
 * it was, then the moments the DM shared and its encounters by kind.
 * "Spotlight on X" names a seat only when this reader's own party read holds
 * it; the server answers the pointer `null` for a seat they cannot see.
 *
 * ### What it deliberately does not carry
 *
 * The DM-only box (its beats are not in this read at all), a link on an
 * encounter chip (the encounter's page is the creator's), the Spotlight counts
 * (the DM's balancing tool), anything that writes (the composer, *Edit*,
 * *Clear*, the share switches) and any command on an act: a player reads the
 * shared acts' titles and nothing else of them. The story so far is here only
 * once the DM shared it, read through its own narrow path (`PlayerStoryCard`),
 * without the DM's controls or *Update needed*.
 */

/** The campaign and the record a player may read, keyed on the campaign. */
const playerChronicleAtom = Atom.family((campaignId: CampaignId) =>
  apiAtom(loadPlayerChronicle(campaignId), [
    reads.campaign(campaignId),
    reads.sessions(campaignId),
    reads.party(campaignId),
    reads.acts(campaignId),
    reads.story(campaignId),
  ]),
);

export function PlayerChronicleScreen({ campaignId }: { readonly campaignId: CampaignId }) {
  const [resource, reload] = useApiAtom(playerChronicleAtom(campaignId));
  const view = resource.state === "ready" ? resource.value : undefined;
  const sessions = useMemo(
    () => (view === undefined ? undefined : sessionsOf(view.nights)),
    [view],
  );
  const target = useSearch({ strict: false }).session;
  const nights = useOpenNights(sessions, target);

  return (
    // The campaign destinations' frame: centred at the Overview's width,
    // header included, so its left edge is the nights'.
    <div className="mx-auto w-full max-w-overview">
      <TopBar
        title="Chronicle"
        subtitle={sessions === undefined ? undefined : summaryLine(sessions, " shared with you")}
      >
        {sessions !== undefined && sessions.length > 0 && (
          <ExpandAll allOpen={nights.allOpen} onToggle={nights.toggleAll} />
        )}
      </TopBar>
      {resource.state === "loading" && <Loading label="Opening the chronicle…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {view !== undefined && <PlayerChronicle view={view} nights={nights} />}
    </div>
  );
}

function PlayerChronicle({
  view,
  nights: open,
}: {
  readonly view: PlayerChronicleView;
  readonly nights: OpenNights;
}) {
  const nights = view.nights;
  const sessions = useMemo(() => sessionsOf(nights), [nights]);
  useLanding(open, sessions);

  if (nights.length === 0) {
    return (
      // What somebody who joined last night sees, and the ordinary outcome
      // rather than an error: sessions start `dm`, so a table with a record
      // ten nights long has nothing here until its DM shares one. It names the
      // person who decides, because otherwise the page reads as broken.
      <div className="flex max-w-3xl flex-col gap-3">
        <PlayerStoryCard story={view.story} sessions={sessions} />
        <EmptyState icon="scroll-text" title="No nights shared yet">
          Your DM decides which nights the table can read back. When they share one, it appears here
          — the moments they kept and the encounters you played. Nothing is missing from{" "}
          <span className="text-heading">{view.campaign.name}</span>; it just has not been shared
          with you.
        </EmptyState>
      </div>
    );
  }

  const groups = groupByAct(sessions, view.acts);
  const byId = new Map(nights.map((night) => [night.session.id, night]));

  return (
    <ChronicleColumns
      main={
        <>
          <PlayerStoryCard story={view.story} sessions={sessions} />
          <ActSections
            groups={groups}
            night={(session) => (
              <SessionEntry
                session={session}
                spotlight={spotlightName(session, view.party)}
                open={open.isOpen(session.id)}
                onToggle={() => open.toggle(session.id)}
              >
                <NightBody audience={{ kind: "player" }} night={byId.get(session.id)!} />
              </SessionEntry>
            )}
          />
        </>
      }
      aside={<JumpTo groups={groups} onJump={open.jump} />}
    />
  );
}
