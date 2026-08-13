import { BestiaryScreen } from "./bestiary/BestiaryScreen";
import { CampaignScreen } from "./campaign/CampaignScreen";
import { CampaignsScreen } from "./campaign/CampaignsScreen";
import { ChronicleScreen } from "./chronicle/ChronicleScreen";
import { PlayerChronicleScreen } from "./chronicle/PlayerChronicleScreen";
import { Gallery } from "./gallery/Gallery";
import { JoinScreen } from "./join/JoinScreen";
import { PartyScreen } from "./party/PartyScreen";
import { PlayerCampaignScreen } from "./play/PlayerCampaignScreen";
import { useRoute } from "./routes";
import { RunScreen } from "./run/RunScreen";

/**
 * Ten screens behind the hash. See `routes.ts` for why it is the hash and not
 * a router, and `shell/AppShell.tsx` for the frame each of them composes.
 *
 * **Three of them are the player's**, and the mode they are in is read off the
 * route rather than held anywhere: `#/play` is the same `CampaignsScreen`
 * answering the other question, and `#/play/campaigns/:c` and its `/chronicle`
 * are screens of their own. See `modeOf` in `routes.ts`.
 *
 * Nothing here asks whether anyone is signed in. Every screen loads through
 * `useApiResource`, which resolves whichever credential exists — hosted session
 * or pasted machine token — and renders the `unauthorized` notice when neither
 * does. That is what keeps `pnpm -F web dev` working for a developer who has
 * never opened the Clerk dashboard.
 */
export function App() {
  const [route] = useRoute();

  switch (route.screen) {
    case "gallery":
      return <Gallery route={route} />;
    case "join":
      return (
        // Keyed on the token: a second invitation opened in the same tab is a
        // different invitation, and neither its preview nor the "you are in"
        // panel from the first should survive into it.
        <JoinScreen key={route.token} token={route.token} route={route} />
      );
    case "campaign":
      return <CampaignScreen campaignId={route.campaignId} route={route} />;
    case "playCampaign":
      return (
        // A different table is a different screen, for the reason every other
        // campaign-keyed screen here is keyed: nothing loaded for one table
        // should survive into another.
        <PlayerCampaignScreen key={route.campaignId} campaignId={route.campaignId} route={route} />
      );
    case "bestiary":
      return (
        // A different campaign is a different bestiary: the environment chips
        // and the "is this list empty at all" answer are accumulated from what
        // has been read, and neither should survive into another campaign's.
        <BestiaryScreen key={route.campaignId} campaignId={route.campaignId} route={route} />
      );
    case "chronicle":
      return (
        // A different campaign is a different record: which night is open and
        // what has been searched for belong to the one being read, and neither
        // should survive into another.
        <ChronicleScreen key={route.campaignId} campaignId={route.campaignId} route={route} />
      );
    case "playChronicle":
      return (
        // Keyed for the reason the DM's Chronicle is: which night is open
        // belongs to the record being read.
        <PlayerChronicleScreen key={route.campaignId} campaignId={route.campaignId} route={route} />
      );
    case "party":
      return (
        // A different campaign is a different table: which member's characters
        // are being assigned belongs to the one being read.
        <PartyScreen key={route.campaignId} campaignId={route.campaignId} route={route} />
      );
    case "run":
      return (
        <RunScreen
          // A different fight is a different screen, not the same one with new
          // props: the stream, the log and the optimistic hit points all belong
          // to one run and none of them should survive into another.
          key={route.runId}
          campaignId={route.campaignId}
          sessionId={route.sessionId}
          runId={route.runId}
          route={route}
        />
      );
    // `campaigns` and `play` are one screen answering two questions — which
    // tables I run, and which I sit at — off the one `GET /me/campaigns` that
    // already carries the role.
    default:
      return <CampaignsScreen route={route} />;
  }
}
