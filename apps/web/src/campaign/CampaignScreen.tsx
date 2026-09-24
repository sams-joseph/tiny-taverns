import type { Encounter } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import {
  CampaignChrome,
  CampaignSettingsButtons,
  type CampaignChromeSlots,
} from "./CampaignChrome";
import { CampaignHero } from "./CampaignHero";
import { EncounterDialog } from "./EncounterDialog";
import { LastTime } from "./LastTime";
import { LiveBanner } from "./LiveBanner";
import { NextSession } from "./NextSession";
import { OverviewPage } from "./OverviewParts";
import { lastNightAtom, type LastNight } from "./overview";
import { PartyCard } from "./PartyCard";
import { RecentNotes } from "./RecentNotes";

/**
 * The campaign's home: the creator's Overview, as the redesign
 * (`Campaign Overview.dc.html`) draws it, against the real API. The cover and
 * the header over it are `CampaignHero.tsx`.
 *
 * Everything on it answers one question: *where were we and what happens when
 * we sit down*. The main column is the night — *Next session*, which carries
 * the prep, and *Last time*; the aside is the table — the party and the notes.
 * While a fight is on the table a banner above everything says which one.
 *
 * ### What the drawing asks for that the data does not have
 *
 * **Do not render a field the API does not have**, because a stubbed value is a
 * worse lie than an absent line. Left out rather than invented, each for the
 * reason on the card that would have drawn it: a scheduled date for the next
 * night, encounters assigned to it, an encounter's CR, DC and readiness, *Open
 * threads*, *At the table*, and *Last time* as a prose summary. The Overview's
 * rows are a summary and open nothing; each card's header link is the way in.
 *
 * Everything but *Last time* is `CampaignView`, which the frame already loads.
 * *Last time* is the one read the Overview adds, handed to the frame as its
 * `extra` so the screen is still one resource (`LastTime.tsx`).
 */

/** The one dialog slot the Overview raises for itself. */
type Editing = { readonly what: "encounter"; readonly encounter: Encounter | undefined };

function Overview({ slots }: { readonly slots: CampaignChromeSlots<LastNight | undefined> }) {
  const { view, extra: lastNight, run, finishSession, openSettings } = slots;
  const [editing, setEditing] = useState<Editing | undefined>();
  const invalidate = useInvalidate();
  const campaignId = view.campaign.id;
  // A campaign opens here the moment it is made, while Hob is still drawing its
  // cover. Re-read the campaign, and the list it came from, until it lands.
  const rereadCover = useCallback(
    () => invalidate([reads.campaign(campaignId), reads.myCampaigns]),
    [invalidate, campaignId],
  );
  useHobDrawingPolling(view.campaign.imagePending, rereadCover);

  return (
    <>
      <OverviewPage
        lead={
          <>
            {view.session !== undefined && view.run !== undefined && (
              <LiveBanner session={view.session} run={view.run} onFinish={finishSession} />
            )}
            <CampaignHero campaign={view.campaign}>
              <CampaignSettingsButtons view={view} onOpen={openSettings} />
            </CampaignHero>
          </>
        }
        main={
          <>
            <NextSession
              view={view}
              onRun={(encounter) => run(encounter.id)}
              onFinish={finishSession}
              onAddEncounter={() => setEditing({ what: "encounter", encounter: undefined })}
              onEditEncounter={(encounter) => setEditing({ what: "encounter", encounter })}
            />
            {lastNight !== undefined && (
              <LastTime lastNight={lastNight} campaignId={campaignId} audience="creator" />
            )}
          </>
        }
        aside={
          <>
            <PartyCard
              party={view.party}
              campaignId={campaignId}
              audience="creator"
              playerCount={view.campaign.playerCount}
            />
            <RecentNotes notes={view.notes} campaignId={campaignId} audience="creator" />
          </>
        }
      />

      {/* Keyed on what is being edited, so opening the dialog on a second row
          builds a fresh form rather than showing the first row's fields. */}
      {editing?.what === "encounter" && (
        <EncounterDialog
          key={editing.encounter?.id ?? "new-encounter"}
          campaignId={campaignId}
          encounter={editing.encounter}
          onClose={() => setEditing(undefined)}
          onSaved={() => setEditing(undefined)}
        />
      )}
    </>
  );
}

export function CampaignScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });

  return (
    // No `title`: the Overview's `h1` is the campaign's name, in its hero.
    <CampaignChrome campaignId={campaignId} extra={lastNightAtom(campaignId)}>
      {(slots) => <Overview slots={slots} />}
    </CampaignChrome>
  );
}
