import { Icon, Tooltip, TooltipContent, TooltipTrigger, cn, type IconName } from "@taverns/ui";
import type { EditorStore } from "./store";
import { TOOLS, type ToolId } from "./tools";

const GLYPH: Readonly<Record<ToolId, IconName>> = {
  select: "mouse-pointer-2",
  floor: "paintbrush",
  wall: "brick-wall",
  room: "frame",
  door: "door-open",
  prop: "box",
  light: "flame",
  region: "square-dashed",
  erase: "eraser",
  party: "users",
};

/** The tools down the left edge, each with its key. */
export function ToolRail({ store, tool }: { readonly store: EditorStore; readonly tool: ToolId }) {
  return (
    <nav
      aria-label="Tools"
      className="pointer-events-auto flex max-h-full flex-col gap-0.5 overflow-y-auto rounded-panel border border-hairline bg-surface-card p-1.5 shadow-3"
    >
      {TOOLS.map((spec) => (
        <div key={spec.id} className="contents">
          {spec.group === true ? (
            <div aria-hidden className="mx-1.5 my-1 h-px bg-hairline" />
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={spec.label}
                  aria-pressed={tool === spec.id}
                  onClick={() => store.setTool(spec.id)}
                  className={cn(
                    "relative grid size-11 cursor-pointer place-items-center rounded-control text-muted-foreground transition-control outline-none",
                    "hover:bg-surface-raised hover:text-heading focus-visible:ring-focus",
                    "aria-pressed:bg-accent-soft aria-pressed:text-accent-ink",
                  )}
                />
              }
            >
              <Icon name={GLYPH[spec.id]} size={20} />
              <span className="absolute right-1 bottom-0.5 font-mono text-micro leading-none text-faint">
                {spec.key.toUpperCase()}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">
              {spec.label} ({spec.key.toUpperCase()})
            </TooltipContent>
          </Tooltip>
        </div>
      ))}
    </nav>
  );
}
