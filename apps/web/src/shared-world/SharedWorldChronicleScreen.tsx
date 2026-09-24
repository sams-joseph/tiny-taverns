import type { SharedWorldId } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { BackLink } from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useShowHob } from "../shell/slots";
import { TopBar } from "../shell/TopBar";
import { SharedWorldChronicle } from "./SharedWorldChronicle";
import { sharedWorldViewAtom } from "./load";

/**
 * A Shared World's whole Chronicle: the Story So Far with its Hob draft, the
 * composer, and every admitted entry. The world's Overview summarises it and
 * its *Read the chronicle* is the way here, as a campaign's *Last time* leads
 * to that campaign's Chronicle tab.
 *
 * The world's name is read from the Overview's own view, which is warm when you
 * came from it; a reader who is not a member is refused by that read and by
 * the Chronicle's, as they are on the Overview.
 */
export function SharedWorldChronicleScreen({ worldId }: { readonly worldId: SharedWorldId }) {
  const [resource, retry] = useApiAtom(sharedWorldViewAtom(worldId));
  // The panel is the layout's, and its Shared World scope is the route's.
  const askHob = useShowHob();
  const name = resource.state === "ready" ? resource.value.sharedWorld.name : undefined;

  return (
    <>
      <TopBar title="Chronicle" {...(name !== undefined && { subtitle: name })}>
        <BackLink render={<Link to="/worlds/$worldId" params={{ worldId }} />}>
          {name ?? "Shared World"}
        </BackLink>
      </TopBar>
      {resource.state === "failed" ? (
        <ApiFailureNotice failure={resource.failure} onRetry={retry} />
      ) : (
        <SharedWorldChronicle worldId={worldId} onAskHob={askHob} />
      )}
    </>
  );
}
