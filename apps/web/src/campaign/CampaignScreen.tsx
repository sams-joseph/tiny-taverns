import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import {
  CampaignChrome,
  CampaignSettingsButtons,
  type CampaignChromeSlots,
} from "./CampaignChrome";
import { CampaignHero } from "./CampaignHero";
import { LastTime } from "./LastTime";
import { LiveBanner } from "./LiveBanner";
import { NextSession } from "./NextSession";
import { OverviewPage } from "./OverviewParts";
import { overviewExtraAtom, type OverviewExtra } from "./overview";
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
 * night, encounters assigned to it, an encounter's CR and DC, *Open threads*,
 * *At the table*, and *Last time* as a prose summary. The Overview's rows are a
 * summary and open nothing; each card's header link is the way in.
 *
 * Everything but *Last time* and the encounters' *Ready* or *Draft* is
 * `CampaignView`, which the frame already loads. Those two are the reads the
 * Overview adds, handed to the frame as its `extra` so the screen is still one
 * resource (`overviewExtraAtom`). Writing an encounter is the encounter
 * builder's page, which *Add encounter* and each row's *Edit* open.
 */

function Overview({ slots }: { readonly slots: CampaignChromeSlots<OverviewExtra> }) {
  const { view, extra, run, pickUp, finishSession, openSettings } = slots;
  const { lastNight } = extra;
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
            prep={extra.prep}
            onRun={(encounter) => run(encounter.id)}
            onPickUp={pickUp}
            onFinish={finishSession}
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
  );
}

export function CampaignScreen() {
  const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });

  return (
    // No `title`: the Overview's `h1` is the campaign's name, in its hero.
    <CampaignChrome campaignId={campaignId} extra={overviewExtraAtom(campaignId)}>
      {(slots) => <Overview slots={slots} />}
    </CampaignChrome>
  );
}
