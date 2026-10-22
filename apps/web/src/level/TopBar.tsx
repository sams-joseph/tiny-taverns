import type { LevelAmbient } from "@taverns/api";
import { Button, Icon, Input, Label, Switch, cn, sectionHeadingVariants } from "@taverns/ui";
import { useEffect, useId, useState } from "react";
import type { EditorState, EditorStore } from "./store";

const AMBIENTS: ReadonlyArray<{ readonly value: LevelAmbient; readonly label: string }> = [
  { value: "bright", label: "Bright" },
  { value: "dim", label: "Dim" },
  { value: "dark", label: "Dark" },
];

const STATUS: Readonly<Record<EditorState["save"]["status"], string>> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  failed: "Not saved",
};

/**
 * The bar across the top: the level's name, its ambient light, whether the
 * lighting and the grid are drawn, undo and redo, and whether it is saved.
 */
export function TopBar({
  store,
  state,
  saving,
}: {
  readonly store: EditorStore;
  readonly state: EditorState;
  /** The owner's own save is in flight (its mutation), on top of the editor's. */
  readonly saving: boolean;
}) {
  const doc = state.history.present;
  const [name, setName] = useState(doc.name);
  const nameId = useId();
  const litId = useId();
  const gridId = useId();
  useEffect(() => setName(doc.name), [doc.name]);
  const status = saving && state.save.status !== "failed" ? "saving" : state.save.status;

  return (
    <header className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-2.5 rounded-panel border border-hairline bg-surface-card px-2.5 py-2 shadow-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-label-s text-faint">Level</span>
        <Label htmlFor={nameId} className="sr-only">
          Level name
        </Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => (name.trim() === "" ? setName(doc.name) : store.rename(name))}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setName(doc.name);
              event.currentTarget.blur();
            }
          }}
          className={cn(
            sectionHeadingVariants({ size: "subtitle" }),
            "h-control-sm max-w-64 min-w-0 border-transparent bg-transparent hover:border-strong",
          )}
        />
      </div>
      <div aria-hidden className="h-6 w-px bg-hairline" />
      <div
        role="radiogroup"
        aria-label="Ambient light"
        className="inline-flex gap-0.5 rounded-control bg-surface-sunken p-0.5"
      >
        {AMBIENTS.map((ambient) => (
          <button
            key={ambient.value}
            type="button"
            role="radio"
            aria-checked={doc.ambient === ambient.value}
            onClick={() => store.setAmbient(ambient.value)}
            className={cn(
              "cursor-pointer rounded-xs px-2.5 py-1 text-label-s font-medium text-muted-foreground transition-control outline-none",
              "hover:text-heading focus-visible:ring-focus",
              "aria-checked:bg-surface-raised aria-checked:text-heading",
            )}
          >
            {ambient.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Switch id={litId} checked={state.lit} onCheckedChange={(lit) => store.choose({ lit })} />
        <Label htmlFor={litId} className="text-label-s text-muted-foreground">
          Lighting
        </Label>
      </div>
      <div className="flex items-center gap-1.5">
        <Switch
          id={gridId}
          checked={state.grid}
          onCheckedChange={(grid) => store.choose({ grid })}
        />
        <Label htmlFor={gridId} className="text-label-s text-muted-foreground">
          Grid
        </Label>
      </div>
      <div aria-hidden className="h-6 w-px bg-hairline" />
      <Button
        variant="ghost"
        size="sm"
        disabled={!store.canUndo}
        onClick={store.undo}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
      >
        <Icon name="undo-2" size={14} />
        Undo
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={!store.canRedo}
        onClick={store.redo}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
      >
        <Icon name="redo-2" size={14} />
        Redo
      </Button>
      <div aria-hidden className="h-6 w-px bg-hairline" />
      <p
        role="status"
        data-status={status}
        className="min-w-0 text-label-s text-muted-foreground data-[status=failed]:text-danger-ink"
        title={state.save.error ?? undefined}
      >
        {STATUS[status]}
      </p>
      <Button
        variant={status === "failed" ? "default" : "secondary"}
        size="sm"
        disabled={status === "saved" || status === "saving"}
        onClick={() => void store.saveNow()}
        title="Save now (Ctrl+S)"
      >
        <Icon name="save" size={14} />
        {status === "failed" ? "Try again" : "Save"}
      </Button>
    </header>
  );
}
