import { Link, useParams } from "@tanstack/react-router";
import { Button, EmptyState, Loading } from "@taverns/ui";
import type { ReactNode } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { useApiAtom } from "../api/atoms";
import { TopBar } from "../shell/TopBar";
import { membershipsAtom } from "./load";

/**
 * A creator's screen, with a sentence for a player who typed its URL.
 *
 * **Not the gate.** Every read behind these screens is refused to a player by
 * the server, and that refusal is what keeps the prep theirs. Without this, the
 * refusal was the only thing a player saw — the frame's creator read fails and
 * says *"That campaign is gone, or it belongs to someone else"* about a table
 * they sit at. This is the words, chosen by the same membership `relation`
 * `CampaignRoute.tsx` chooses the Overview by, before any creator read is
 * made. It names no encounter and says nothing about whether one exists: the
 * answer is the same for every URL under the route.
 *
 * An account that is no participant falls through to the screen, whose load
 * answers the honest `NotFound`, exactly as `CampaignRouteScreen` does.
 */
export function creatorOnly(title: string, Screen: () => ReactNode): () => ReactNode {
  return function CreatorOnlyScreen() {
    const { campaignId } = useParams({ from: "/_shell/campaigns/$campaignId" });
    const [resource, retry] = useApiAtom(membershipsAtom);

    if (resource.state === "loading") {
      return (
        <>
          <TopBar title={title} />
          <Loading label="Opening the table…" />
        </>
      );
    }
    if (resource.state === "failed") {
      return (
        <>
          <TopBar title={title} />
          <ApiFailureNotice failure={resource.failure} onRetry={retry} />
        </>
      );
    }

    const relation = resource.value.find((row) => row.campaign.id === campaignId)?.relation;
    if (relation !== "player") return <Screen />;

    return (
      <div className="mx-auto w-full max-w-overview">
        <TopBar title={title} />
        <EmptyState icon="eye-off" title="The DM's side of the screen">
          This is where the DM prepares the table. What they share is on the Overview.
        </EmptyState>
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link to="/campaigns/$campaignId" params={{ campaignId }} />}
          >
            Back to the Overview
          </Button>
        </div>
      </div>
    );
  };
}
