import { CampaignScreen } from "./campaign/CampaignScreen";
import { CampaignsScreen } from "./campaign/CampaignsScreen";
import { Gallery } from "./gallery/Gallery";
import { useRoute } from "./routes";

/**
 * Three screens behind the hash. See `routes.ts` for why it is the hash and not
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
    default:
      return <CampaignsScreen route={route} />;
  }
}
