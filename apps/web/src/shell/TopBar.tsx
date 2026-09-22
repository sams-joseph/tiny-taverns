import type { CampaignId } from "@taverns/api";
import { Button, Icon } from "@taverns/ui";
import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCampaignAct } from "../campaign/act";
import { useCampaignId, useCampaignRelation, useSection } from "./location";
import { TopBarSlot } from "./slots";

/**
 * The per-screen header: what you are looking at, and what you can do to it.
 *
 * Rendered anywhere in a screen's tree and drawn in the layout's slot, above
 * `main`. Outside a layout there is no slot and it draws nothing, which is the
 * absent state rather than a second place for the bar to be.
 *
 * `--fs-display-s` at `--ls-display`, which is where the delivery puts it now
 * that the wordmark sits in its own row above — one step down from the rail-era
 * `--fs-display-m`, because this is no longer the only display-sized thing on
 * the screen.
 *
 * ### The height is fixed, and the subtitle's line is reserved whether or not
 * there is one
 *
 * Measured in Chromium at 1440 before this: 61px on a screen with no subtitle,
 * 89 with one, 141 on the Cast at 760 where the action cluster wrapped under the
 * title. So the content's top edge moved 152 → 180 → 220 walking across one
 * campaign's own tabs, and the page appeared to jump every time a DM changed
 * tab. It is one row of `h-19` now, whose title cell is `h-12` — the display
 * line, the 4px gap and the body line, which is what a title *and* a subtitle
 * measure — and the cell is that tall with a subtitle or without, so the title
 * lands at the same y on every screen in the product.
 *
 * `mb-0` on the subtitle is not decoration: the delivered `base.css` gives every
 * `p` a `0 0 var(--s-5)` margin, and that 12px below the subtitle was two thirds
 * of the difference between this bar and the sum of its parts.
 *
 * **Nothing wraps.** A fixed height and a wrapping row are the same bug written
 * twice; the title truncates instead, which is the rule the campaign row above
 * already follows — the title is the one part of the bar that is arbitrary
 * length, so it is the one that gives way.
 *
 * ### Tabs get their own row, below the header — the captain's rule
 *
 * > If we ever have tabs in the app like we do in the library I want those to
 * > be on their own row below the header. And any actions we have that belong
 * > to that tab should be inside of the content of that tab and not on the
 * > same hierarchical level as the tabs themselves.
 *
 * So `tabs` is a distinct full-width 40px row under the title row, inside the
 * same header so the strip's underline lands on the header's own bottom hairline
 * (the recipe's `-mb-px`, the campaign row's mechanism). `children` stays for
 * things that are genuinely header-level — a tab-scoped action does not belong
 * here or on the tab row; it goes inside that tab's content, which for the
 * Library screens is `FilterBar`'s `actions` slot.
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
  readonly children?: ReactNode;
}

function ScreenBar({ title, subtitle, tabs, children }: TopBarProps) {
  return (
    <header className="border-b border-hairline bg-surface-card">
      <div className="flex h-19 items-center gap-gutter px-page-sm @3xl/app:px-page">
        {/* `h-12` is the reserved pair of lines; see this file's header. The
            title block is top-aligned inside it so the `h1` sits at the same y
            whether a subtitle follows it or not. */}
        <div className="h-12 min-w-32 flex-1">
          <h1 className="truncate font-display text-display-s leading-tight font-semibold tracking-display text-heading">
            {title}
          </h1>
          {subtitle !== undefined && (
            <p className="mt-1 mb-0 truncate text-body-s leading-body text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {/* Where the row runs out, the screen's own controls scroll — they do
            not wrap (the height is fixed) and they are not cut off (the shell
            clips, so anything past the edge is simply gone, which is how *Start
            an encounter* lost its last three letters at 760). `min-w-32` on the
            title is the floor that makes this the thing that gives: a `flex-1`
            title with a zero basis would collapse to nothing first and leave a
            bar that does not say what it is. Measured at 390 on the Cast, whose
            bar carries four controls and a search box. */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5 overflow-x-auto [scrollbar-width:none]">
            {children}
          </div>
          {/* Outside the scroller on purpose: the campaign's press is the
              shell's, it was fully visible on its own row before it moved here,
              and a crowded screen is not a reason to hide it. What scrolls is
              what that screen put in the bar. */}
          <CampaignAct />
        </div>
      </div>
      {tabs !== undefined && (
        // `items-stretch` with no bottom padding: the strip's items reach the
        // header's hairline, exactly as the campaign row's do.
        <div className="flex h-10 items-stretch overflow-x-auto px-page-sm @3xl/app:px-page">
          {tabs}
        </div>
      )}
    </header>
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
 * **Except the Overview**, whose *Tonight* card is the campaign's own card and
 * carries this same press already — `useCampaignAct` computes it once, so the
 * two cannot disagree about which of the three it is. Drawing both would put two
 * peach buttons on one screen, which is the budget the bar exists to keep.
 */
function CampaignAct() {
  const campaignId = useCampaignId();
  const section = useSection();
  const relation = useCampaignRelation(campaignId);
  if (campaignId === undefined || relation !== "creator" || section === "overview") return null;
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
