import { createFileRoute } from "@tanstack/react-router";
import { ShellLayout } from "../shell/ShellLayout";

/**
 * The persistent layout: `AppShell` mounted once, with the Hob panel, around
 * every screen but two.
 *
 * Pathless, so it adds nothing to a URL — but it **does** add to every route
 * id below it, which is what `useParams({ from })` and `RouteIds` name: the
 * campaign route's id is `/_shell/campaigns/$campaignId`. Leaf `remountDeps`
 * remount the leaf, never this, which is the whole point: see
 * `shell/ShellLayout.tsx`.
 */
export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});
