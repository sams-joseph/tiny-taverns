import {
  LIGHT_PRESETS,
  LEVEL_LIGHT_FEET_MAX,
  PROP_KINDS,
  propBehaviour,
  propFootprint,
  type LayoutLight,
  type LayoutProp,
  type LayoutRegion,
  type LayoutWall,
  type LevelCover,
  type LevelDoorState,
  type LevelLightTone,
  type LevelRegionKind,
  type LightPreset,
} from "@taverns/api";
import {
  Button,
  Checkbox,
  Icon,
  Input,
  Label,
  SectionHeading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { useEffect, useId, useState, type ReactNode } from "react";
import { lengthOf } from "./document";
import {
  presetOf,
  rotateProp,
  updateLight,
  updateProp,
  updateRegion,
  updateWall,
  type PropFlags,
} from "./edits";
import {
  COVER_LABEL,
  DOOR_STATE_LABEL,
  PRESET_LABEL,
  PROP_LABEL,
  REGION_LABEL,
  TONE_LABEL,
} from "./labels";
import type { Viewer } from "./picking";
import type { EditorState, EditorStore } from "./store";

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-label-s text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="h-control-sm">
          <SelectValue>
            {(current: unknown) =>
              options.find((o) => o.value === current)?.label ?? String(current)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
  aside,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Drawn at the row's end: whether this is the kit's default or an override. */
  readonly aside?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(next) => onChange(next)} />
      <Label htmlFor={id} className="flex-1 text-body-s text-foreground">
        {label}
      </Label>
      {aside}
    </div>
  );
}

/** A number of feet, committed on blur or Enter. */
function Feet({
  label,
  value,
  step,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0 || n > LEVEL_LIGHT_FEET_MAX) {
      setText(String(value));
      return;
    }
    const rounded = Math.round(n);
    if (rounded !== value) onChange(rounded);
    setText(String(rounded));
  };
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="w-28 text-label-s text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        mono
        type="number"
        inputMode="numeric"
        min={0}
        max={LEVEL_LIGHT_FEET_MAX}
        step={step}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className="h-control-sm w-20"
      />
      <span className="text-label-s text-faint">ft</span>
    </div>
  );
}

/** "Kit" when a flag is the kit's default, else a button that hands it back. */
function Override({
  overridden,
  onReset,
  what,
}: {
  readonly overridden: boolean;
  readonly onReset: () => void;
  readonly what: string;
}) {
  if (!overridden) {
    return <span className="text-micro text-faint">kit default</span>;
  }
  return (
    <button
      type="button"
      onClick={onReset}
      aria-label={`Reset ${what} to the kit's default`}
      className="cursor-pointer text-micro text-accent-ink underline underline-offset-2 hover:text-accent-hover"
    >
      reset
    </button>
  );
}

function Remove({
  onClick,
  label = "Delete",
}: {
  readonly onClick: () => void;
  readonly label?: string;
}) {
  return (
    <div className="flex justify-end">
      <Button variant="outline" size="sm" className="text-danger-ink" onClick={onClick}>
        <Icon name="trash-2" size={14} />
        {label}
      </Button>
    </div>
  );
}

function Facts({ rows }: { readonly rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1.5 text-body-s">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-faint">{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const COVERS: ReadonlyArray<LevelCover> = ["none", "half", "threeQuarters", "total"];
const TONES: ReadonlyArray<LevelLightTone> = ["fire", "arcane", "moon", "radiant"];
const DOOR_STATES: ReadonlyArray<LevelDoorState> = ["closed", "open", "locked"];
const REGION_KINDS: ReadonlyArray<LevelRegionKind> = [
  "difficult",
  "magicalDarkness",
  "heavyObscurement",
  "hazard",
  "trap",
];

function PropPanel({ store, prop, feet }: { store: EditorStore; prop: LayoutProp; feet: number }) {
  const kit = PROP_KINDS[prop.kind];
  const now = propBehaviour(prop);
  const { width, height } = propFootprint(prop);
  const set = (patch: Partial<PropFlags>) => store.edit((doc) => updateProp(doc, prop.id, patch));
  const flag = (name: "blocksMovement" | "blocksSight" | "difficult", label: string) => (
    <Check
      label={label}
      checked={now[name]}
      onChange={(checked) => set({ [name]: checked })}
      aside={
        <Override
          overridden={prop[name] !== null}
          what={label.toLowerCase()}
          onReset={() => set({ [name]: null })}
        />
      }
    />
  );
  return (
    <>
      <SectionHeading as="h2" size="subtitle">
        {PROP_LABEL[prop.kind]}
      </SectionHeading>
      <Facts
        rows={[
          ["Footprint", `${String(width * feet)} × ${String(height * feet)} ft`],
          [
            "Rotation",
            <Button
              key="turn"
              variant="ghost"
              size="sm"
              onClick={() => store.edit((doc) => rotateProp(doc, prop.id))}
              title="Rotate (Q)"
            >
              {`${String(prop.rotation * 90)}° ↻`}
            </Button>,
          ],
        ]}
      />
      {flag("blocksMovement", "Blocks movement")}
      {flag("blocksSight", "Blocks sight")}
      {flag("difficult", "Difficult terrain")}
      <div className="flex flex-col gap-1">
        <Choice
          label="Cover it gives"
          value={now.cover}
          options={COVERS.map((value) => ({ value, label: COVER_LABEL[value] }))}
          onChange={(cover) => set({ cover })}
        />
        <div className="flex justify-end">
          <Override
            overridden={prop.cover !== null}
            what="cover"
            onReset={() => set({ cover: null })}
          />
        </div>
      </div>
      <Check label="DM only" checked={prop.dmOnly} onChange={(dmOnly) => set({ dmOnly })} />
      {kit.light !== null ? (
        <p className="text-label-s text-faint">
          Carries its own light: {kit.light.bright}/{kit.light.dim} ft.
        </p>
      ) : null}
      <Remove onClick={() => store.remove({ type: "prop", id: prop.id })} />
    </>
  );
}

function LightPanel({ store, light }: { store: EditorStore; light: LayoutLight }) {
  const set = (patch: Partial<Omit<LayoutLight, "id">>) =>
    store.edit((doc) => updateLight(doc, light.id, patch));
  const preset = presetOf(light);
  const presets = Object.keys(LIGHT_PRESETS) as Array<LightPreset>;
  return (
    <>
      <SectionHeading as="h2" size="subtitle">
        Light
      </SectionHeading>
      <Choice<LightPreset | "custom">
        label="Kind"
        value={preset ?? "custom"}
        options={[
          ...presets.map((value) => ({ value, label: PRESET_LABEL[value] })),
          ...(preset === null ? [{ value: "custom" as const, label: "Custom" }] : []),
        ]}
        onChange={(value) => {
          if (value === "custom") return;
          const { bright, dim, tone } = LIGHT_PRESETS[value];
          set({ bright, dim, tone, flicker: tone === "fire" });
        }}
      />
      <Feet label="Bright" value={light.bright} step={5} onChange={(bright) => set({ bright })} />
      <Feet label="Dim (beyond)" value={light.dim} step={5} onChange={(dim) => set({ dim })} />
      <Choice
        label="Tone"
        value={light.tone}
        options={TONES.map((value) => ({ value, label: TONE_LABEL[value] }))}
        onChange={(tone) => set({ tone })}
      />
      <Check label="Flickers" checked={light.flicker} onChange={(flicker) => set({ flicker })} />
      <Check label="Lit" checked={light.lit} onChange={(lit) => set({ lit })} />
      <Remove onClick={() => store.remove({ type: "light", id: light.id })} />
    </>
  );
}

function WallPanel({ store, wall, feet }: { store: EditorStore; wall: LayoutWall; feet: number }) {
  const set = (patch: Parameters<typeof updateWall>[2]) =>
    store.edit((doc) => updateWall(doc, wall.id, patch));
  const door = wall.kind !== "wall";
  return (
    <>
      <SectionHeading as="h2" size="subtitle">
        {wall.kind === "wall" ? "Wall" : wall.kind === "door" ? "Door" : "Secret door"}
      </SectionHeading>
      <Facts rows={[["Length", `${String(Math.round(lengthOf(wall) * feet))} ft`]]} />
      {door ? (
        <>
          <Choice
            label="State"
            value={wall.doorState ?? "closed"}
            options={DOOR_STATES.map((value) => ({ value, label: DOOR_STATE_LABEL[value] }))}
            onChange={(doorState) => set({ doorState })}
          />
          <Check
            label="Secret (a wall to players until found)"
            checked={wall.kind === "secretDoor"}
            onChange={(secret) => set({ kind: secret ? "secretDoor" : "door" })}
          />
        </>
      ) : null}
      <Check
        label="Low wall (blocks movement, not sight)"
        checked={wall.low}
        onChange={(low) => set({ low })}
      />
      <Remove onClick={() => store.remove({ type: "wall", id: wall.id })} />
    </>
  );
}

function RegionPanel({
  store,
  region,
  feet,
}: {
  store: EditorStore;
  region: LayoutRegion;
  feet: number;
}) {
  const set = (patch: Partial<Pick<LayoutRegion, "kind" | "secret">>) =>
    store.edit((doc) => updateRegion(doc, region.id, patch));
  return (
    <>
      <SectionHeading as="h2" size="subtitle">
        {REGION_LABEL[region.kind]}
      </SectionHeading>
      <Facts
        rows={[
          [
            "Area",
            `${String(region.squares.length)} squares (${String(region.squares.length * feet * feet)} sq ft)`,
          ],
        ]}
      />
      <Choice
        label="Kind"
        value={region.kind}
        options={REGION_KINDS.map((value) => ({ value, label: REGION_LABEL[value] }))}
        onChange={(kind) => set({ kind })}
      />
      <Check
        label="Secret (the DM's until revealed)"
        checked={region.secret}
        onChange={(secret) => set({ secret })}
      />
      <Remove onClick={() => store.remove({ type: "region", id: region.id })} />
    </>
  );
}

function ViewerPanel({ store, viewer }: { store: EditorStore; viewer: Viewer }) {
  return (
    <>
      <SectionHeading as="h2" size="subtitle">
        {viewer.name}
      </SectionHeading>
      <Feet
        label="Darkvision"
        value={viewer.darkvision}
        step={30}
        onChange={(darkvision) => store.updateViewer(viewer.id, { darkvision })}
      />
      <p className="text-label-s text-faint">
        A viewer is scratch for this preview. At the table, sight comes from each character's
        senses.
      </p>
      <Remove label="Remove" onClick={() => store.removeViewer(viewer.id)} />
    </>
  );
}

/** The selected thing's flags, beside the canvas's right edge. Nothing selected, nothing drawn. */
export function Inspector({
  store,
  state,
}: {
  readonly store: EditorStore;
  readonly state: EditorState;
}) {
  const sel = state.selection;
  if (sel === null) return null;
  const doc = state.history.present;
  const feet = doc.feetPerCell;
  let body: ReactNode = null;
  switch (sel.type) {
    case "prop": {
      const prop = doc.props.find((p) => p.id === sel.id);
      if (prop !== undefined) body = <PropPanel store={store} prop={prop} feet={feet} />;
      break;
    }
    case "light": {
      const light = doc.lights.find((l) => l.id === sel.id);
      if (light !== undefined) body = <LightPanel store={store} light={light} />;
      break;
    }
    case "wall": {
      const wall = doc.walls.find((w) => w.id === sel.id);
      if (wall !== undefined) body = <WallPanel store={store} wall={wall} feet={feet} />;
      break;
    }
    case "region": {
      const region = doc.regions.find((r) => r.id === sel.id);
      if (region !== undefined) body = <RegionPanel store={store} region={region} feet={feet} />;
      break;
    }
    case "viewer": {
      const viewer = state.viewers.find((v) => v.id === sel.id);
      if (viewer !== undefined) body = <ViewerPanel store={store} viewer={viewer} />;
      break;
    }
  }
  if (body === null) return null;
  return (
    <aside
      aria-label="Inspector"
      className="pointer-events-auto flex max-h-full w-65 flex-col gap-3 overflow-y-auto rounded-panel border border-hairline bg-surface-card p-3.5 shadow-3"
    >
      {body}
    </aside>
  );
}
