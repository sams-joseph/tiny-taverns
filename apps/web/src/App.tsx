import { BestiaryScreen } from "./bestiary/BestiaryScreen";
import { CampaignScreen } from "./campaign/CampaignScreen";
import { CampaignsScreen } from "./campaign/CampaignsScreen";
import { ChronicleScreen } from "./chronicle/ChronicleScreen";
import { Gallery } from "./gallery/Gallery";
import { useRoute } from "./routes";
import { RunScreen } from "./run/RunScreen";

/**
 * Five screens behind the hash. See `routes.ts` for why it is the hash and not
 * a router, and `shell/AppShell.tsx` for the frame each of them composes.
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
    case "campaign":
      return <CampaignScreen campaignId={route.campaignId} route={route} />;
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
    default:
      return <CampaignsScreen route={route} />;
  }
}
