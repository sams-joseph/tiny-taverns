import { sectionHeadingVariants } from "@taverns/ui";
import { monthOf } from "../chronicle/format";
import { HobCover } from "../hob/HobCover";
import { Description } from "../ui/description";
import { CampaignSettingsButtons, type CampaignChromeSlots } from "./CampaignChrome";
import type { CampaignView } from "./load";

/**
 * The top of the creator's Overview, as the redesign (`Campaign Overview.dc.html`)
 * draws it: the cover, and the campaign's header laid over the bottom of it.
 *
 * **The campaign's name is this page's `h1`.** Every other campaign tab titles
 * itself with which tab it is (`TopBar`); the Overview is the campaign itself,
 * so it passes no title to the frame and this header is the only one on it.
 *
 * **The header overlaps the cover only when there is a picture to overlap.**
 * With one, it is pulled up over the picture's faded bottom and inset from its
 * edges; with none — never drawn, Hob still drawing, the draw failed, the URL
 * would not load — it sits flat under whatever is above it. What decides is
 * `HobCover`'s `data-picture`, read through `group-has-*`, because a URL that
 * fails is only discovered inside the cover and a second copy of that state
 * here would be the one that forgot. The "Hob is drawing" band keeps its badge
 * clear for the same reason: pending is not a picture.
 *
 * ### What the drawing's header asks for that the data does not have
 *
 * Its meta line reads *"D&D 5e · Every other Thursday · Since March 2026"*. The
 * ruleset is the only one the product plays, so it is a constant, not a fact
 * about this campaign, and was left out (the captain's answer to the plan's
 * question 7); nothing stores a schedule. What the line carries is the party's
 * name, which the per-screen subtitle used to, and how long the table has been
 * running, from `createdAt`.
 *
 * The drawing's *Settings* drops the sharing control's word. The captain kept
 * it: the button reads *Settings* and then *Private* or *Shared*, because the
 * current answer must be legible without opening anything
 * (`CampaignChrome.tsx`, *The sharing control*).
 */
export function CampaignHero({
  view,
  onOpen,
}: {
  readonly view: CampaignView;
  readonly onOpen: CampaignChromeSlots["openSettings"];
}) {
  const { campaign } = view;
  const meta = [campaign.partyName, `Since ${monthOf(campaign.createdAt)}`].filter(
    (part): part is string => part !== null && part.trim() !== "",
  );

  return (
    <div
      data-slot="campaign-hero"
      className="group/hero @container flex flex-col gap-6 has-data-picture:gap-0"
    >
      <HobCover image={campaign.image} pending={campaign.imagePending} shape="hero" />
      <header className="relative flex flex-wrap items-end gap-6 group-has-data-picture/hero:-mt-overview-overlap group-has-data-picture/hero:px-6">
        <div className="min-w-0 grow basis-md">
          <p className="mb-0 flex flex-wrap items-center gap-2 text-label leading-none font-medium text-muted-foreground">
            {meta.map((part, index) => (
              <span key={part} className="contents">
                {index > 0 && (
                  <span aria-hidden className="text-faint">
                    ·
                  </span>
                )}
                <span>{part}</span>
              </span>
            ))}
          </p>
          <h1 className={sectionHeadingVariants({ size: "hero", className: "mt-3" })}>
            {campaign.name}
          </h1>
          <Description text={campaign.description} className="mt-2.5 max-w-overview-pitch" />
        </div>
        <div className="flex flex-none flex-wrap items-center gap-2">
          <CampaignSettingsButtons view={view} onOpen={onOpen} />
        </div>
      </header>
    </div>
  );
}
