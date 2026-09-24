import type { CampaignId } from "@taverns/api";
import { Button, Icon, PageHeader } from "@taverns/ui";
import { useContext, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { useCampaignAct } from "../campaign/act";
import { useCampaignId, useCampaignRelation, useSection } from "./location";
import { TopBarSlot } from "./slots";

/**
 * The per-screen header, drawn where the layout reserves it.
 *
 * Rendered anywhere in a screen's tree and drawn in the layout's slot, above
 * `main`. Outside a layout there is no slot and it draws nothing, which is the
 * absent state rather than a second place for the bar to be.
 *
 * The header itself is `PageHeader`'s — its fixed height, its tab row and its
 * rules are written there. What this adds is the app's half: the portal, and
 * the campaign's own press at the end of the action cluster.
 */
export function TopBar(props: TopBarProps) {
  const slot = useContext(TopBarSlot);
  return slot === null ? null : createPortal(<ScreenBar {...props} />, slot);
}

interface TopBarProps {
  readonly title: string;
  readonly subtitle?: string;
  /** A tab strip, on its own row below the title — never beside it. */
  readonly tabs?: ReactNode;
  /** The screen's verbs; a `BackLink` first when the screen has a parent. */
  readonly children?: ReactNode;
}

function ScreenBar({ title, subtitle, tabs, children }: TopBarProps) {
  return (
    <PageHeader
      title={title}
      {...(subtitle !== undefined && { subtitle })}
      {...(tabs !== undefined && { tabs })}
      actions={
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2.5 empty:hidden @4xl/app:shrink-0 @4xl/app:flex-nowrap">
            {children}
          </div>
          <CampaignAct />
        </>
      }
    />
  );
}

/**
 * The one press that belongs to the whole campaign — *Start session*, *Start an
 * encounter* or *Back to the fight* — at the end of the per-screen bar's action
 * cluster.
 *
 * **It used to be the campaign row's**, pushed right past six tabs, and that is
 * where it broke the row: measured at 760 it reached x=788 against a row ending
 * at 760 and was cut mid-word by the shell's `overflow-hidden`. It is also the
 * wrong row for it — the campaign row is navigation, and this is the only verb
 * that was ever on it.
 *
 * **It sources itself from the route**, exactly as the campaign row does and for
 * the same reason: it was once a prop a screen passed, and the screens that
 * forgot drew chrome missing it (`campaign/campaignRow.test.tsx` is that bug's
 * record). So every screen inside a campaign gets it without asking, and no
 * screen can ask for it twice.
 *
 * **Except the Overview**, whose *Next session* card (or, while a fight is on
 * the table, its live banner) carries this same press already —
 * `useCampaignAct` computes it once, so they cannot disagree about which of
 * the three it is. Drawing both would put two peach buttons on one screen,
 * which is the budget the bar exists to keep.
 *
 * **And one encounter's page**, whose own *Run* is this press aimed at that
 * encounter (`campaign/EncounterScreen.tsx`) — the same `run` from the same
 * `useCampaignAct`, so it goes back to a live fight exactly as this would.
 */
function CampaignAct() {
  const campaignId = useCampaignId();
  const section = useSection();
  const relation = useCampaignRelation(campaignId);
  // Decoded only on the encounter's own route, never on the list's splat.
  const onEncounter = useParams({ strict: false }).encounterId !== undefined;
  if (campaignId === undefined || relation !== "creator" || section === "overview" || onEncounter) {
    return null;
  }
  return <CampaignActButton campaignId={campaignId} />;
}

/**
 * The press itself — its own component so the night read happens only where
 * there is a press to draw. The creator's only, which is the delivery's
 * `!player` guard held as a shape instead of a check: at a table this account
 * merely plays at, `campaignNightAtom` is visibility-gated and is never asked.
 */
function CampaignActButton({ campaignId }: { readonly campaignId: CampaignId }) {
  const { act, dialogs } = useCampaignAct(campaignId);

  return (
    <>
      {act !== undefined && (
        <Button size="sm" onClick={act.press}>
          <Icon name={act.icon} size={13} />
          {act.label}
        </Button>
      )}
      {dialogs}
    </>
  );
}
