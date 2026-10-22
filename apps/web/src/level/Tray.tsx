import {
  DIFFICULT_MATERIALS,
  LEVEL_MATERIALS,
  LEVEL_PROP_KINDS,
  LEVEL_REGION_KINDS,
  LIGHT_PRESETS,
  PROP_KINDS,
  type LevelRegionKind,
  type LightPreset,
} from "@taverns/api";
import { Checkbox, Label, cn } from "@taverns/ui";
import { useId, useMemo, type ReactNode } from "react";
import { drawProp } from "./kitArt";
import { MATERIAL_LABEL, PRESET_LABEL, PROP_LABEL, REGION_LABEL } from "./labels";
import { readPalette } from "./palette";
import type { EditorState, EditorStore } from "./store";

const REGION_KINDS: ReadonlyArray<LevelRegionKind> = LEVEL_REGION_KINDS;

function Item({
  pressed,
  image,
  label,
  sub,
  onClick,
}: {
  readonly pressed: boolean;
  readonly image?: string | undefined;
  readonly label: string;
  readonly sub?: string | undefined;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex min-w-16 shrink-0 cursor-pointer flex-col items-center gap-1 rounded-control border border-transparent p-1.5",
        "text-label-s font-medium text-muted-foreground transition-control outline-none",
        "hover:bg-surface-raised focus-visible:ring-focus",
        "aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-heading",
      )}
    >
      {image !== undefined && image !== "" ? (
        <img src={image} alt="" className="size-12 rounded-xs bg-level-void object-contain" />
      ) : null}
      <span>{label}</span>
      {sub !== undefined ? <span className="font-mono text-micro text-faint">{sub}</span> : null}
    </button>
  );
}

function Strip({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <section
      aria-label={label}
      className="pointer-events-auto flex max-w-full items-stretch gap-1.5 overflow-x-auto rounded-panel border border-hairline bg-surface-card p-2 shadow-3"
    >
      {children}
    </section>
  );
}

/**
 * The palette along the bottom for the tool in hand: floor materials painted
 * by the floor shader, the prop kit from its own canvases, light presets,
 * door kinds, region kinds, or the party's viewers.
 */
export function Tray({
  store,
  state,
  floorThumbs,
}: {
  readonly store: EditorStore;
  readonly state: EditorState;
  /** Each material's thumbnail by index, once the renderer has painted them. */
  readonly floorThumbs: ReadonlyArray<string>;
}) {
  const secretId = useId();
  const propThumbs = useMemo(() => {
    const palette = readPalette(document.documentElement);
    return new Map(
      LEVEL_PROP_KINDS.map((kind) => [kind, drawProp(kind, palette)?.toDataURL() ?? ""]),
    );
  }, []);

  switch (state.tool) {
    case "floor":
    case "room":
      return (
        <Strip label="Floors">
          {LEVEL_MATERIALS.map((material, index) =>
            state.tool === "room" && index === 0 ? null : (
              <Item
                key={material}
                pressed={state.material === index}
                image={floorThumbs[index]}
                label={MATERIAL_LABEL[material]}
                sub={
                  DIFFICULT_MATERIALS.has(material)
                    ? "difficult"
                    : index === 0
                      ? "clears"
                      : undefined
                }
                onClick={() => store.choose({ material: index })}
              />
            ),
          )}
        </Strip>
      );
    case "prop":
      return (
        <Strip label="Props">
          {LEVEL_PROP_KINDS.map((kind) => {
            const spec = PROP_KINDS[kind];
            return (
              <Item
                key={kind}
                pressed={state.prop === kind}
                image={propThumbs.get(kind)}
                label={PROP_LABEL[kind]}
                sub={`${String(spec.width)}×${String(spec.height)}${spec.blocksSight ? " · blocks sight" : ""}`}
                onClick={() => store.choose({ prop: kind })}
              />
            );
          })}
        </Strip>
      );
    case "light":
      return (
        <Strip label="Lights">
          {(Object.keys(LIGHT_PRESETS) as Array<LightPreset>).map((preset) => (
            <Item
              key={preset}
              pressed={state.light === preset}
              label={PRESET_LABEL[preset]}
              sub={`${String(LIGHT_PRESETS[preset].bright)}/${String(LIGHT_PRESETS[preset].dim)} ft`}
              onClick={() => store.choose({ light: preset })}
            />
          ))}
        </Strip>
      );
    case "door":
      return (
        <Strip label="Doors">
          <Item
            pressed={state.doorKind === "door"}
            label="Door"
            sub="blocks sight shut"
            onClick={() => store.choose({ doorKind: "door" })}
          />
          <Item
            pressed={state.doorKind === "secretDoor"}
            label="Secret door"
            sub="a wall to players"
            onClick={() => store.choose({ doorKind: "secretDoor" })}
          />
        </Strip>
      );
    case "region":
      return (
        <Strip label="Regions">
          {REGION_KINDS.map((kind) => (
            <Item
              key={kind}
              pressed={state.regionKind === kind}
              label={REGION_LABEL[kind]}
              onClick={() =>
                store.choose({
                  regionKind: kind,
                  // Traps are the DM's until found.
                  regionSecret:
                    kind === "trap" ? true : kind === state.regionKind ? state.regionSecret : false,
                })
              }
            />
          ))}
          {/* A way in is the DM's overlay and never secret. */}
          {state.regionKind === "entry" ? null : (
            <div className="flex items-center gap-2 px-2">
              <Checkbox
                id={secretId}
                checked={state.regionSecret}
                onCheckedChange={(checked) => store.choose({ regionSecret: checked })}
              />
              <Label htmlFor={secretId} className="text-label-s text-muted-foreground">
                Secret
              </Label>
            </div>
          )}
        </Strip>
      );
    case "party":
      return (
        <Strip label="The party">
          {state.viewers.map((viewer) => (
            <Item
              key={viewer.id}
              pressed={state.selection?.type === "viewer" && state.selection.id === viewer.id}
              label={viewer.name}
              sub={
                viewer.darkvision > 0
                  ? `darkvision ${String(viewer.darkvision)} ft`
                  : "no darkvision"
              }
              onClick={() => store.select({ type: "viewer", id: viewer.id })}
            />
          ))}
          <Item
            pressed={false}
            label="Forget explored"
            sub="reset memory"
            onClick={store.forgetExplored}
          />
          <p className="max-w-72 self-center px-2 text-label-s text-faint">
            {state.viewers.length === 0
              ? "Click a square to place a viewer. What the party sees together is lit; what it has seen stays dim."
              : "Shared party vision: the union of what every viewer sees. Viewers are scratch and are never saved."}
          </p>
        </Strip>
      );
    default:
      return null;
  }
}
