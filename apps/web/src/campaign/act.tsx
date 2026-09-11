import type { CampaignId, EncounterId } from "@taverns/api";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate, useParams, type LinkProps } from "@tanstack/react-router";
import type { IconName } from "@taverns/ui";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { campaignNightAtom, type CampaignNight } from "./load";
import { StartRun } from "./StartRun";
import { StartSessionDialog } from "./StartSessionDialog";

/**
 * The one press the campaign offers, whichever of its three things it is.
 *
 * **It is drawn twice**, on the campaign row and in the Overview's *Tonight*
 * card, and both must say the same thing: two controls computing the same
 * three-way branch independently is two controls that can differ. So both call
 * `useCampaignAct`, and `actFor` is the branch.
 */
export interface CampaignAct {
  readonly label: string;
  readonly icon: IconName;
  readonly press: () => void;
}

/**
 * The three states, and the words for each.
 *
 * They used to be two — `live === undefined ? "Start session" : "Back to the
 * fight"` — and that was wrong the moment a night could be open with nothing on
 * the table: `live` is still undefined there, so the campaign would offer *Start
 * session* for a session already running and the press would try to open a
 * second one. **The session and the run are two questions and are asked
 * separately.**
 */
const actFor = (
  night: CampaignNight,
  onRun: () => void,
  onStartSession: () => void,
): CampaignAct =>
  night.run !== undefined
    ? { label: "Back to the fight", icon: "swords", press: onRun }
    : night.session === undefined
      ? { label: "Start session", icon: "play", press: onStartSession }
      : // The night is open. What is left to do is the DM's discretion — an
        // encounter goes on the table when the party reaches one — so the press
        // is the fight rather than a second night.
        { label: "Start an encounter", icon: "swords", press: onRun };

export interface CampaignActs {
  /**
   * The press, or `undefined` while tonight is still being read — and on the
   * fight it would send you back to, where a press that goes where you already
   * are is not a press.
   */
  readonly act: CampaignAct | undefined;
  /**
   * Put an encounter on the table, or walk back into the fight already on it.
   *
   * One function for both because it is one press to a DM, and which of the two
   * it is depends on the live run. **It opens a night if there is not one** —
   * `StartRunDialog`'s cold branch — so an encounter card's *Run* still works in
   * one step on a campaign that has never played.
   */
  readonly run: (encounterId?: EncounterId) => void;
  /** The dialogs the presses open. The caller renders this wherever it is. */
  readonly dialogs: ReactNode;
}

/**
 * The campaign's press and the dialogs behind it, for whoever draws it.
 *
 * It reads `campaignNightAtom` — the campaign, its open session and its live
 * run — rather than the whole view, because the campaign row asks on screens
 * that read nothing else about the campaign (the runner, the create form). On
 * the campaign's own destinations those atoms are already held by the view, so
 * it costs nothing there.
 */
export function useCampaignAct(campaignId: CampaignId): CampaignActs {
  const result = useAtomValue(campaignNightAtom(campaignId));
  const night = AsyncResult.isSuccess(result) ? result.value : undefined;
  const here = useParams({ strict: false }).runId;
  const navigate = useNavigate();
  /** The encounter the DM pressed Run on, while the start dialog is open. */
  const [starting, setStarting] = useState<{ readonly encounterId: EncounterId | undefined }>();
  /** Whether the "open the night" confirmation is up. */
  const [opening, setOpening] = useState(false);

  /**
   * Where the runner is, when there is a fight to go back to.
   *
   * Memoised because it is an object: a fresh literal every render would give
   * `run` a fresh identity every render, and `run` reaches an encounter grid.
   */
  const live: LinkProps | undefined = useMemo(
    () =>
      night?.run !== undefined && night.session !== undefined
        ? {
            to: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
            params: { campaignId, sessionId: night.session.id, runId: night.run.id },
          }
        : undefined,
    [campaignId, night?.run, night?.session],
  );

  const run = useCallback(
    (encounterId?: EncounterId) => {
      if (live !== undefined) {
        void navigate(live);
        return;
      }
      setStarting({ encounterId });
    },
    [live, navigate],
  );
  const startSession = useCallback(() => setOpening(true), []);
  const stopStarting = useCallback(() => setStarting(undefined), []);

  const act =
    night === undefined || (night.run !== undefined && night.run.id === here)
      ? undefined
      : actFor(night, () => run(), startSession);

  const dialogs =
    night === undefined ? null : (
      <>
        {opening && (
          <StartSessionDialog
            campaign={night.campaign}
            onClose={() => setOpening(false)}
            // There is no run to navigate to — that is the whole point of this
            // door — so the DM stays where they are and the screen catches up on
            // the two reads the dialog named.
            onStarted={() => setOpening(false)}
          />
        )}
        {starting !== undefined && (
          <StartRun
            campaignId={campaignId}
            night={night}
            preselected={starting.encounterId}
            onClose={stopStarting}
          />
        )}
      </>
    );

  return { act, run, dialogs };
}
