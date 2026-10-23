import type {
  BoardSquare,
  CampaignId,
  Encounter,
  EncounterCreature,
  EncounterLevelPlacement,
  Level,
} from "@taverns/api";
import { Button, Card, Icon, SectionHeading, cn } from "@taverns/ui";
import { Result } from "effect";
import { type DragEvent, type PointerEvent, useMemo, useRef, useState } from "react";
import { useApiAtom } from "../api/atoms";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { LevelPreview } from "../level/LevelPreview";
import { placedLabels } from "../run/tokens";
import { useArrivalScroll } from "../ui/arrival";
import { levelVisitsAtom } from "../visits/load";
import { encounterPrepAtom } from "./load";
import {
  draftOf,
  type Instance,
  instancesOf,
  paintTrigger,
  payloadOf,
  type PlacementDraft,
  placeOn,
  sameAs,
  takeOff,
} from "./placement";

/** What a press on the level does: stand the picked creature, or paint the trigger area. */
type Mode = "creatures" | "trigger";

const percent = (fraction: number) => `${String(fraction * 100)}%`;

/** The drag's payload: which instance is carried. */
const CARRIED = "application/x-taverns-instance";

/**
 * *Where they wait*: the encounter's creatures placed on squares of its level
 * before the fight, and the area that sets it off (`EncounterSpots.ts`),
 * saved whole through `encounters.place`. The level is its still
 * (`LevelPreview`), read-only, with the placed creatures over it; the page
 * scrolls as every encounter page does.
 *
 * Pick a creature (in the list, or on the level) and press a square to stand
 * it there, or drag it there; *Take off* sends it back to the list. *Trigger
 * area* turns the press into a brush that paints squares on or off. Every
 * square is held to the server's own rule (`placeOn`), so a refusal is said
 * before the save. A played encounter is not placed again: the server refuses
 * it, and the card says so instead.
 */
export function EncounterPlacement({
  campaignId,
  encounter,
  roster,
  level,
  played,
}: {
  readonly campaignId: CampaignId;
  readonly encounter: Encounter;
  readonly roster: ReadonlyArray<EncounterCreature>;
  readonly level: Level;
  readonly played: boolean;
}) {
  const [prep, retry] = useApiAtom(encounterPrepAtom({ campaignId, encounterId: encounter.id }));
  // The builder's *Place on the level* opens the page at `#placement`, and
  // this card is drawn only once the encounter and its level have answered.
  useArrivalScroll("placement");
  return (
    <Card id="placement" className="scroll-mt-(--chrome-height) gap-4 p-card">
      <SectionHeading size="title">Where they wait</SectionHeading>
      {played ? (
        <p className="text-body-s leading-body text-muted-foreground">
          This encounter has been played. A placement is for a fight still to come.
        </p>
      ) : roster.length === 0 ? (
        <p className="text-body-s leading-body text-muted-foreground">
          No creatures to place yet. Add them with <span className="text-heading">Edit</span>.
        </p>
      ) : prep.state === "failed" ? (
        <ApiFailureNotice failure={prep.failure} onRetry={retry} />
      ) : prep.state === "ready" ? (
        <PlacementEditor
          key={JSON.stringify(prep.value.placement)}
          campaignId={campaignId}
          encounter={encounter}
          roster={roster}
          level={level}
          saved={prep.value.placement}
        />
      ) : null}
    </Card>
  );
}

function PlacementEditor({
  campaignId,
  encounter,
  roster,
  level,
  saved,
}: {
  readonly campaignId: CampaignId;
  readonly encounter: Encounter;
  readonly roster: ReadonlyArray<EncounterCreature>;
  readonly level: Level;
  readonly saved: EncounterLevelPlacement;
}) {
  const instances = useMemo(() => instancesOf(roster), [roster]);
  const labels = useMemo(
    () => placedLabels(instances.map((instance) => ({ ...instance, id: instance.key }))),
    [instances],
  );
  const [draft, setDraft] = useState<PlacementDraft>(() => draftOf(saved, instances));
  const [picked, setPicked] = useState<string | undefined>(
    () => instances.find((instance) => !draftOf(saved, instances).spots.has(instance.key))?.key,
  );
  const [mode, setMode] = useState<Mode>("creatures");
  const [said, setSaid] = useState<string>();
  const painting = useRef<boolean | undefined>(undefined);
  const surface = useRef<HTMLDivElement>(null);
  const saving = useMutation();
  // The visits of this level carry the placement on the DM's stage.
  const [visits] = useApiAtom(levelVisitsAtom(campaignId));

  const { columns, rows } = level;
  const changed = !sameAs(draft, saved, instances);
  const placed = instances.filter((instance) => draft.spots.has(instance.key));
  const waiting = instances.filter((instance) => !draft.spots.has(instance.key));

  /** The square under a point of the page, or none off the level. */
  const squareAt = (clientX: number, clientY: number): BoardSquare | undefined => {
    const box = surface.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return undefined;
    const column = Math.floor(((clientX - box.left) / box.width) * columns);
    const row = Math.floor(((clientY - box.top) / box.height) * rows);
    if (column < 0 || row < 0 || column >= columns || row >= rows) return undefined;
    return { column, row };
  };

  const stand = (key: string, square: BoardSquare) => {
    const next = placeOn(draft, level, key, square);
    if ("refused" in next) {
      setSaid(next.refused);
      return;
    }
    setSaid(undefined);
    setDraft(next);
    // The next creature still waiting is picked, so a roster places press by press.
    setPicked(waiting.find((instance) => instance.key !== key)?.key);
  };

  const press = (event: PointerEvent<HTMLDivElement>) => {
    const square = squareAt(event.clientX, event.clientY);
    if (square === undefined) return;
    if (mode === "trigger") {
      const index = square.row * columns + square.column;
      const on = !draft.trigger.has(index);
      painting.current = on;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDraft((now) => paintTrigger(now, index, on));
      return;
    }
    if (picked !== undefined) stand(picked, square);
  };
  const brush = (event: PointerEvent<HTMLDivElement>) => {
    if (mode !== "trigger" || painting.current === undefined) return;
    const square = squareAt(event.clientX, event.clientY);
    if (square === undefined) return;
    const on = painting.current;
    setDraft((now) => paintTrigger(now, square.row * columns + square.column, on));
  };
  const lift = () => {
    painting.current = undefined;
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const key = event.dataTransfer.getData(CARRIED);
    const square = squareAt(event.clientX, event.clientY);
    if (key !== "" && square !== undefined) stand(key, square);
  };
  const carry = (instance: Instance) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(CARRIED, instance.key);
    event.dataTransfer.effectAllowed = "move";
    setPicked(instance.key);
  };

  const save = async () => {
    const visitKeys =
      visits.state === "ready"
        ? visits.value
            .filter((visit) => visit.levelId === encounter.levelId)
            .map((visit) => reads.levelVisit(visit.id))
        : [];
    const done = await saving.submit(
      (client) =>
        client.encounters.place({
          params: { campaignId, encounterId: encounter.id },
          payload: payloadOf(draft, instances),
        }),
      // The prep carries the placement and answers `encounters`; a visit of
      // the level draws it on the DM's stage.
      [reads.encounters(campaignId), ...visitKeys],
    );
    if (Result.isFailure(done)) {
      setSaid(
        done.failure.kind === "conflict"
          ? done.failure.message
          : "The placement did not reach the server. Nothing was saved.",
      );
    } else {
      setSaid("Saved.");
    }
  };

  const nameOf = (key: string | undefined) =>
    instances.find((instance) => instance.key === key)?.name;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="What a press does" className="flex gap-1">
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={mode === "creatures"}
            className="aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
            onClick={() => setMode("creatures")}
          >
            <Icon name="footprints" size={14} />
            Creatures
          </Button>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={mode === "trigger"}
            className="aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
            onClick={() => setMode("trigger")}
          >
            <Icon name="flag" size={14} />
            Trigger area
          </Button>
        </div>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={draft.spots.size === 0 && draft.trigger.size === 0}
            onClick={() => {
              setDraft({ spots: new Map(), trigger: new Set() });
              setPicked(instances[0]?.key);
            }}
          >
            <Icon name="eraser" size={14} />
            Clear
          </Button>
          <Button size="sm" disabled={!changed || saving.busy} onClick={() => void save()}>
            <Icon name="save" size={14} />
            Save placement
          </Button>
        </span>
      </div>

      <p role="status" className="min-h-lh text-body-s leading-body text-muted-foreground">
        {said ??
          (mode === "trigger"
            ? "Paint the squares that set the encounter off when the party walks in. Press a painted square to clear it."
            : picked === undefined
              ? "Pick a creature, then press a square to stand it there, or drag it there."
              : `Press a square to stand ${nameOf(picked) ?? "it"} there.`)}
      </p>

      <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative">
          <LevelPreview level={level} label={`The level ${level.name}, to place creatures on`} />
          <div
            ref={surface}
            data-slot="placement-surface"
            aria-hidden
            className={cn(
              "absolute inset-0 touch-none",
              mode === "trigger" || picked !== undefined ? "cursor-crosshair" : "cursor-default",
            )}
            onPointerDown={press}
            onPointerMove={brush}
            onPointerUp={lift}
            onPointerCancel={lift}
            onDragOver={(event) => event.preventDefault()}
            onDrop={drop}
          >
            {[...draft.trigger].map((square) => (
              <span
                key={square}
                data-trigger={square}
                className="pointer-events-none absolute border border-magic bg-magic-soft opacity-70"
                style={{
                  left: percent((square % columns) / columns),
                  top: percent(Math.floor(square / columns) / rows),
                  width: percent(1 / columns),
                  height: percent(1 / rows),
                }}
              />
            ))}
          </div>
          {placed.map((instance) => {
            const square = draft.spots.get(instance.key)!;
            return (
              <button
                key={instance.key}
                type="button"
                draggable
                data-placed={instance.key}
                aria-label={`${instance.name}, column ${String(square.column + 1)}, row ${String(square.row + 1)}`}
                aria-pressed={picked === instance.key}
                title={instance.name}
                onDragStart={carry(instance)}
                onClick={() => setPicked(instance.key)}
                className={cn(
                  "absolute flex items-center justify-center rounded-full border-2 border-dashed border-danger bg-surface-raised font-sans text-micro leading-none font-semibold text-heading",
                  "aria-pressed:ring-2 aria-pressed:ring-ring",
                  mode === "trigger" && "pointer-events-none",
                )}
                style={{
                  left: percent(square.column / columns),
                  top: percent(square.row / rows),
                  width: percent(1 / columns),
                  height: percent(1 / rows),
                }}
              >
                {labels.get(instance.key)}
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-3 @3xl:w-run-rail">
          <InstanceList
            title="Not placed"
            empty="Every creature is on the level."
            instances={waiting}
            picked={picked}
            onPick={setPicked}
            onCarry={carry}
          />
          <InstanceList
            title="On the level"
            empty="None yet."
            instances={placed}
            picked={picked}
            onPick={setPicked}
            onCarry={carry}
            onTakeOff={(key) => {
              setDraft((now) => takeOff(now, key));
              setPicked(key);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function InstanceList({
  title,
  empty,
  instances,
  picked,
  onPick,
  onCarry,
  onTakeOff,
}: {
  readonly title: string;
  readonly empty: string;
  readonly instances: ReadonlyArray<Instance>;
  readonly picked: string | undefined;
  readonly onPick: (key: string) => void;
  readonly onCarry: (instance: Instance) => (event: DragEvent<HTMLElement>) => void;
  readonly onTakeOff?: (key: string) => void;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <SectionHeading as="h3" size="label">
        {title}
      </SectionHeading>
      {instances.length === 0 ? (
        <p className="text-body-s leading-body text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {instances.map((instance) => (
            <li key={instance.key} className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                draggable
                aria-pressed={picked === instance.key}
                className="flex-1 justify-start aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
                onDragStart={onCarry(instance)}
                onClick={() => onPick(instance.key)}
              >
                {instance.name}
              </Button>
              {onTakeOff !== undefined && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Take ${instance.name} off the level`}
                  title="Take off the level"
                  onClick={() => onTakeOff(instance.key)}
                >
                  <Icon name="x" size={14} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
