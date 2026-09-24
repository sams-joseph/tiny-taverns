import {
  BATTLE_MAP_SQUARES_MAX,
  type BattleMap,
  type BattleMapGrid,
  type BattleMapUpdate,
  type CampaignId,
  cellPxForColumns,
  offsetWithinSquare,
  type PictureSize,
  rowsThatFit,
} from "@taverns/api";
import { Button, Card, Icon, Input, Label, SectionHeading, Switch } from "@taverns/ui";
import { Result } from "effect";
import { type ReactNode, useId, useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure } from "../ui/form";
import type { BattleMapView } from "./BattleMapBoard";

/**
 * Lining the grid up with the picture, in place under the board: the board
 * above previews the draft as it is typed, Save writes the grid whole
 * (`battleMaps.update`), and Cancel drops the draft and shows the saved grid
 * again.
 *
 * ### Squares across is the one control most maps need
 *
 * Hob draws no grid into the picture, so there is nothing to line up against
 * but the DM's sense of scale. *Squares across* sets the square's size so that
 * many fill the picture's width after the offset (`cellPxForColumns`), and the
 * rows follow: as many whole squares as fit down it (`rowsThatFit`). Without a
 * picture the board is its own plane, so the square keeps its size and the
 * DM sets both counts.
 *
 * ### The offset is within one square
 *
 * A nudge past a square's edge is the same grid one column over, so the step
 * buttons wrap (`offsetWithinSquare`) — the square's size does not change, and
 * the board slides under a fixed count. A typed offset outside `[0, square)` is
 * refused here with the same rule `BattleMapAlignment` refuses it with on the
 * wire.
 */

/** A square's smallest and largest size, in the original's pixels — `BattleMapAlignment`'s bounds. */
const CELL_PX_MIN = 8;
const CELL_PX_MAX = 1024;
const FEET_MAX = 100;

/** The fields as typed: numbers the DM is part-way through are strings. */
interface Draft {
  readonly grid: BattleMapGrid;
  readonly columns: string;
  /** Only read when there is no picture; with one, the rows follow the squares. */
  readonly rows: string;
  readonly feet: string;
  readonly offsetX: string;
  readonly offsetY: string;
  /** Not typed: set from *squares across* on a picture, kept otherwise. */
  readonly cellPx: number;
}

type Problems = Partial<Record<"columns" | "rows" | "feet" | "offsetX" | "offsetY", string>>;

/** Two decimals at most: a square is 76.8 px, not 76.80000000000001. */
const px = (value: number): string => String(Math.round(value * 100) / 100);

const wholeNumber = (text: string): number => (/^\s*\d+\s*$/.test(text) ? Number(text) : NaN);
const decimal = (text: string): number => (text.trim() === "" ? NaN : Number(text));

const draftOf = (map: BattleMap): Draft => ({
  grid: map.grid,
  columns: String(map.columns),
  rows: String(map.rows),
  feet: String(map.feetPerCell),
  offsetX: px(map.alignment.offsetXPx),
  offsetY: px(map.alignment.offsetYPx),
  cellPx: map.alignment.cellPx,
});

/** The draft read back as a map, or what is wrong with it. */
const read = (
  draft: Draft,
  picture: PictureSize | null,
): { readonly problems: Problems; readonly update: Required<BattleMapUpdate> | undefined } => {
  const problems: Problems = {};
  const { cellPx } = draft;
  const columns = wholeNumber(draft.columns);
  const feet = wholeNumber(draft.feet);
  const offsetXPx = decimal(draft.offsetX);
  const offsetYPx = decimal(draft.offsetY);

  const within = (offset: number) => Number.isFinite(offset) && offset >= 0 && offset < cellPx;
  if (!within(offsetXPx)) problems.offsetX = `From 0 to under ${px(cellPx)}, one square.`;
  if (!within(offsetYPx)) problems.offsetY = `From 0 to under ${px(cellPx)}, one square.`;

  if (picture === null) {
    if (!(columns >= 1 && columns <= BATTLE_MAP_SQUARES_MAX)) {
      problems.columns = `From 1 to ${String(BATTLE_MAP_SQUARES_MAX)} squares.`;
    }
  } else {
    // The square's size is what the wire bounds; say it as the count it allows.
    const span = picture.width - (within(offsetXPx) ? offsetXPx : 0);
    const fewest = Math.max(1, Math.ceil(span / CELL_PX_MAX));
    const most = Math.min(BATTLE_MAP_SQUARES_MAX, Math.floor(span / CELL_PX_MIN));
    if (!(columns >= fewest && columns <= most)) {
      problems.columns = `From ${String(fewest)} to ${String(most)} squares across this picture.`;
    }
  }

  const rows =
    picture === null
      ? wholeNumber(draft.rows)
      : within(offsetYPx)
        ? rowsThatFit(picture.height, { cellPx, offsetXPx, offsetYPx })
        : NaN;
  if (picture === null && !(rows >= 1 && rows <= BATTLE_MAP_SQUARES_MAX)) {
    problems.rows = `From 1 to ${String(BATTLE_MAP_SQUARES_MAX)} squares.`;
  }
  if (!(feet >= 1 && feet <= FEET_MAX)) problems.feet = `From 1 to ${String(FEET_MAX)} feet.`;

  return Object.keys(problems).length > 0 || !(rows >= 1)
    ? { problems, update: undefined }
    : {
        problems,
        update: {
          grid: draft.grid,
          columns,
          rows: Math.min(rows, BATTLE_MAP_SQUARES_MAX),
          feetPerCell: feet,
          alignment: { cellPx, offsetXPx, offsetYPx },
        },
      };
};

/**
 * The draft as the board draws it: each field that reads cleanly, and the
 * saved value where it does not yet — so a half-typed number does not blank
 * the preview.
 */
const previewOf = (map: BattleMap, draft: Draft, picture: PictureSize | null): BattleMapView => {
  const { problems } = read(draft, picture);
  // A refused offset previews as the saved one, brought within the draft's square.
  const offset = (problem: string | undefined, typed: string, saved: number) =>
    problem === undefined ? decimal(typed) : offsetWithinSquare(saved, draft.cellPx);
  const aligned = {
    cellPx: draft.cellPx,
    offsetXPx: offset(problems.offsetX, draft.offsetX, map.alignment.offsetXPx),
    offsetYPx: offset(problems.offsetY, draft.offsetY, map.alignment.offsetYPx),
  };
  return {
    ...map,
    grid: draft.grid,
    columns: problems.columns === undefined ? wholeNumber(draft.columns) : map.columns,
    rows:
      picture === null
        ? problems.rows === undefined
          ? wholeNumber(draft.rows)
          : map.rows
        : rowsThatFit(picture.height, aligned),
    feetPerCell: problems.feet === undefined ? wholeNumber(draft.feet) : map.feetPerCell,
    alignment: aligned,
  };
};

/**
 * The squares-across field changed: on a picture, the square is resized so
 * that many fill the width, and an offset that is now a whole square or more
 * wraps into the new one.
 */
const withColumns = (draft: Draft, text: string, picture: PictureSize | null): Draft => {
  const next = { ...draft, columns: text };
  const columns = wholeNumber(text);
  if (picture === null || !(columns >= 1)) return next;
  const typedX = decimal(draft.offsetX);
  const offsetX = Number.isFinite(typedX) && typedX >= 0 ? typedX : 0;
  let cellPx = cellPxForColumns(picture.width, columns, offsetX);
  if (!(cellPx >= CELL_PX_MIN && cellPx <= CELL_PX_MAX)) return next;
  const wrappedX = offsetWithinSquare(offsetX, cellPx);
  if (wrappedX !== offsetX) cellPx = cellPxForColumns(picture.width, columns, wrappedX);
  const typedY = decimal(draft.offsetY);
  return {
    ...next,
    cellPx,
    offsetX: px(wrappedX),
    offsetY: Number.isFinite(typedY) ? px(offsetWithinSquare(typedY, cellPx)) : draft.offsetY,
  };
};

/** One pixel along, wrapping at the square's edge. */
const nudged = (text: string, saved: number, by: number, cellPx: number): string => {
  const typed = decimal(text);
  const from = Number.isFinite(typed) ? typed : saved;
  return px(offsetWithinSquare(from + by, cellPx));
};

export interface GridAdjustment {
  /** The board as it should be drawn now: the draft while adjusting, the saved map otherwise. */
  readonly shown: BattleMapView;
  readonly adjusting: boolean;
  readonly open: () => void;
  /** The panel, or nothing when closed. */
  readonly panel: ReactNode;
}

/**
 * The adjustment's state, shared by the board (which previews it) and the
 * panel (which edits it) — one hook, so the two cannot disagree.
 */
export function useGridAdjustment({
  campaignId,
  map,
}: {
  readonly campaignId: CampaignId;
  readonly map: BattleMap;
}): GridAdjustment {
  const [draft, setDraft] = useState<Draft>();
  const picture = map.image === null ? null : { width: map.image.width, height: map.image.height };
  const close = () => setDraft(undefined);
  return {
    shown: draft === undefined ? map : previewOf(map, draft, picture),
    adjusting: draft !== undefined,
    open: () => setDraft(draftOf(map)),
    panel:
      draft === undefined ? null : (
        <AdjustGridPanel
          campaignId={campaignId}
          map={map}
          picture={picture}
          draft={draft}
          onDraft={setDraft}
          onClose={close}
        />
      ),
  };
}

function AdjustGridPanel({
  campaignId,
  map,
  picture,
  draft,
  onDraft,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly map: BattleMap;
  readonly picture: PictureSize | null;
  readonly draft: Draft;
  readonly onDraft: (draft: Draft) => void;
  readonly onClose: () => void;
}) {
  const id = useId();
  const { busy, failure, submit } = useMutation();
  const { problems, update } = read(draft, picture);
  const shown = previewOf(map, draft, picture);
  const set = (fields: Partial<Draft>) => onDraft({ ...draft, ...fields });

  const save = async () => {
    if (update === undefined) return;
    const saved = await submit(
      (client) =>
        client.battleMaps.update({
          params: { campaignId, encounterId: map.encounterId },
          payload: update,
        }),
      [reads.battleMap(map.encounterId)],
    );
    if (Result.isSuccess(saved)) onClose();
  };

  const nudge = (axis: "offsetX" | "offsetY", by: number) =>
    set({
      [axis]: nudged(
        draft[axis],
        axis === "offsetX" ? map.alignment.offsetXPx : map.alignment.offsetYPx,
        by,
        draft.cellPx,
      ),
    });

  return (
    <Card aria-labelledby={`${id}-title`} role="group" className="gap-4 p-card">
      <div className="flex flex-col gap-1">
        <SectionHeading as="h3" id={`${id}-title`} size="title">
          Adjust grid
        </SectionHeading>
        <p className="max-w-measure text-body-s leading-body text-muted-foreground">
          The board above shows the grid as you set it. Nothing changes until you save.
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <Switch
          id={`${id}-grid`}
          checked={draft.grid === "square"}
          onCheckedChange={(next) => set({ grid: next ? "square" : "none" })}
        />
        <Label htmlFor={`${id}-grid`}>Show grid lines</Label>
      </div>

      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Field
          label="Squares across"
          htmlFor={`${id}-columns`}
          {...(problems.columns === undefined
            ? { hint: `${px(draft.cellPx)} px a square` }
            : { error: problems.columns })}
        >
          <Input
            id={`${id}-columns`}
            mono
            type="number"
            min={1}
            max={BATTLE_MAP_SQUARES_MAX}
            value={draft.columns}
            aria-invalid={problems.columns !== undefined || undefined}
            onChange={(event) => onDraft(withColumns(draft, event.target.value, picture))}
            className="w-24"
          />
        </Field>

        {picture === null ? (
          <Field
            label="Squares down"
            htmlFor={`${id}-rows`}
            {...(problems.rows === undefined ? {} : { error: problems.rows })}
          >
            <Input
              id={`${id}-rows`}
              mono
              type="number"
              min={1}
              max={BATTLE_MAP_SQUARES_MAX}
              value={draft.rows}
              aria-invalid={problems.rows !== undefined || undefined}
              onChange={(event) => set({ rows: event.target.value })}
              className="w-24"
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-label leading-snug font-medium">Squares down</span>
            <span className="font-mono text-mono text-foreground">{String(shown.rows)}</span>
            <span className="text-caption leading-body text-muted-foreground">
              As many as fit down the picture.
            </span>
          </div>
        )}

        <Field
          label="Feet per square"
          htmlFor={`${id}-feet`}
          {...(problems.feet === undefined ? {} : { error: problems.feet })}
        >
          <Input
            id={`${id}-feet`}
            mono
            type="number"
            min={1}
            max={FEET_MAX}
            value={draft.feet}
            aria-invalid={problems.feet !== undefined || undefined}
            onChange={(event) => set({ feet: event.target.value })}
            className="w-24"
          />
        </Field>

        <OffsetField
          id={`${id}-x`}
          label="Move right (px)"
          value={draft.offsetX}
          error={problems.offsetX}
          less={{
            icon: "chevron-left",
            label: "Move the grid left",
            onClick: () => nudge("offsetX", -1),
          }}
          more={{
            icon: "chevron-right",
            label: "Move the grid right",
            onClick: () => nudge("offsetX", 1),
          }}
          onChange={(offsetX) => set({ offsetX })}
          cellPx={draft.cellPx}
        />
        <OffsetField
          id={`${id}-y`}
          label="Move down (px)"
          value={draft.offsetY}
          error={problems.offsetY}
          less={{
            icon: "chevron-up",
            label: "Move the grid up",
            onClick: () => nudge("offsetY", -1),
          }}
          more={{
            icon: "chevron-down",
            label: "Move the grid down",
            onClick: () => nudge("offsetY", 1),
          }}
          onChange={(offsetY) => set({ offsetY })}
          cellPx={draft.cellPx}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5">
        {failure !== undefined && (
          <div className="min-w-0 flex-1">
            <SaveFailure failure={failure} />
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void save()}
          disabled={busy || update === undefined}
        >
          <Icon name="check" size={14} />
          Save grid
        </Button>
      </div>
    </Card>
  );
}

interface Step {
  readonly icon: "chevron-left" | "chevron-right" | "chevron-up" | "chevron-down";
  readonly label: string;
  readonly onClick: () => void;
}

function OffsetField({
  id,
  label,
  value,
  error,
  less,
  more,
  onChange,
  cellPx,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly less: Step;
  readonly more: Step;
  readonly onChange: (value: string) => void;
  readonly cellPx: number;
}) {
  return (
    <Field label={label} htmlFor={id} {...(error === undefined ? {} : { error })}>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" aria-label={less.label} onClick={less.onClick}>
          <Icon name={less.icon} size={14} />
        </Button>
        <Input
          id={id}
          mono
          type="number"
          min={0}
          max={cellPx}
          step="any"
          value={value}
          aria-invalid={error !== undefined || undefined}
          onChange={(event) => onChange(event.target.value)}
          className="w-24"
        />
        <Button variant="ghost" size="icon" aria-label={more.label} onClick={more.onClick}>
          <Icon name={more.icon} size={14} />
        </Button>
      </div>
    </Field>
  );
}
