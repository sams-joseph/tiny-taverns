import type { CampaignId, EncounterId } from "@taverns/api";
import { useNavigate } from "@tanstack/react-router";
import { useApiAtom } from "../api/atoms";
import { levelVisitsAtom } from "../visits/load";
import { encountersAtom, type CampaignNight } from "./load";
import { StartRunDialog } from "./StartRunDialog";

/**
 * The start dialog, with the encounter list it offers.
 *
 * Read here, when the dialog opens, rather than by `useCampaignAct`: the
 * campaign row holds that hook on every creator screen, and a list of every
 * encounter is not something the runner should read to draw one button. On a
 * campaign destination the view already holds the list, so it opens at once.
 */
export function StartRun({
  campaignId,
  night,
  preselected,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly night: CampaignNight;
  readonly preselected: EncounterId | undefined;
  readonly onClose: () => void;
}) {
  const navigate = useNavigate();
  const [encounters] = useApiAtom(encountersAtom(campaignId));
  // Which levels the party has been to, and which is on the table: a fight on
  // one of them is played there (`StartRunDialog`). A list that would not
  // read offers every start, and the server's refusal says what to do.
  const [visits] = useApiAtom(levelVisitsAtom(campaignId));
  if (encounters.state !== "ready" || visits.state === "loading") return null;

  return (
    <StartRunDialog
      campaign={night.campaign}
      session={night.session}
      encounters={encounters.value}
      visits={visits.state === "ready" ? visits.value : []}
      preselected={preselected}
      onClose={onClose}
      onStarted={(sessionId, runId) => {
        onClose();
        void navigate({
          to: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
          params: { campaignId, sessionId, runId },
        });
      }}
    />
  );
}
