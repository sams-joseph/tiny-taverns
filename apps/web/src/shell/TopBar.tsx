import { PageHeader } from "@taverns/ui";
import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCampaignId } from "./location";
import { TopBarSlot } from "./slots";

/**
 * The per-screen header: the screen's title, its verbs and its own tabs.
 *
 * **Where it is drawn is the route's, not the screen's.** Above any campaign it
 * is the per-screen bar: portalled into the slot the layout reserves in the
 * sticky chrome, above `main`. Inside a campaign there is no per-screen bar —
 * the captain's decision of 2026-09-23, from the Overview redesign: every
 * campaign screen is a tab of one thing, the campaign row is the last chrome
 * row there and it carries the campaign's own press — so the same header is
 * drawn in place, which is the top of the screen's content, because every
 * screen renders this first.
 *
 * It asks the route rather than taking a prop for the reason the campaign row
 * and its press do: a screen that had to remember would be the one that
 * forgot, and would draw a bar on one tab of a campaign whose other tabs have
 * none. `shell/ShellLayout.test.tsx` visits every campaign destination and
 * finds the layout's slot empty.
 *
 * Outside a layout there is no slot and the bar draws nothing, which is the
 * absent state rather than a second place for it to be. The header itself is
 * `PageHeader`'s — its fixed lines, its tab row and its rules are written
 * there, once for both placements.
 */
export function TopBar(props: TopBarProps) {
  const slot = useContext(TopBarSlot);
  const inCampaign = useCampaignId() !== undefined;
  if (inCampaign) return <ScreenHeader {...props} placement="content" />;
  return slot === null ? null : createPortal(<ScreenHeader {...props} placement="bar" />, slot);
}

interface TopBarProps {
  readonly title: string;
  readonly subtitle?: string;
  /** A state word beside the title (`PageHeader`'s `badge`). */
  readonly badge?: ReactNode;
  /** The runner's card-framed header (`PageHeader`'s `framed`); content placement only. */
  readonly framed?: boolean;
  /** A tab strip, on its own row below the title — never beside it. */
  readonly tabs?: ReactNode;
  /** The screen's verbs; a `BackLink` first when the screen has a parent. */
  readonly children?: ReactNode;
}

function ScreenHeader({
  title,
  subtitle,
  badge,
  framed,
  tabs,
  children,
  placement,
}: TopBarProps & { readonly placement: "bar" | "content" }) {
  return (
    <PageHeader
      placement={placement}
      title={title}
      {...(subtitle !== undefined && { subtitle })}
      {...(badge !== undefined && { badge })}
      framed={framed === true && placement === "content"}
      {...(tabs !== undefined && { tabs })}
      actions={
        <div className="flex min-w-0 flex-wrap items-center gap-2.5 empty:hidden @4xl/app:shrink-0 @4xl/app:flex-nowrap">
          {children}
        </div>
      }
    />
  );
}
