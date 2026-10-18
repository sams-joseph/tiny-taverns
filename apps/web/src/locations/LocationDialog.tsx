import {
  LOCATION_APPEARANCE_MAX,
  LOCATION_DESCRIPTION_MAX,
  LOCATION_KINDS,
  LOCATION_NAME_MAX,
  LOCATION_NOTES_MAX,
  type Location,
  type LocationId,
  type LocationKind,
} from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  SectionHeading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useMemo, useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea } from "../ui/form";
import { LOCATION_KIND_LABELS } from "./kind";
import { subtreeIds } from "./tree";

/** The parent picker's value for a place that stands on its own. */
const TOP: string = "top";

interface Draft {
  readonly kind: LocationKind;
  readonly name: string;
  /** A place's id, or {@link TOP}. */
  readonly parent: string;
  readonly description: string;
  readonly appearance: string;
  readonly notes: string;
}

const draftOf = (place: Location): Draft => ({
  kind: place.kind,
  name: place.name,
  parent: place.parentId ?? TOP,
  description: place.description ?? "",
  appearance: place.appearance ?? "",
  notes: place.notes ?? "",
});

/** A blank prose field is no prose: omitted on a create, cleared on an edit. */
const prose = (text: string): string | undefined => (text.trim() === "" ? undefined : text.trim());

/**
 * Writing one of the owner's places, new or existing: its kind, its name, the
 * place it sits inside (one of the owner's own, never itself or anything under
 * it), what a visitor finds, the line its map will be drawn from, and the
 * owner's own notes, which no table or world is shown.
 */
export function LocationDialog({
  place,
  places,
  parentId,
  onClose,
  onSaved,
}: {
  /** The place being edited, or `undefined` for a new one. */
  readonly place: Location | undefined;
  /** Every place on the owner's shelf, the parent picker's choices. */
  readonly places: ReadonlyArray<Location>;
  /** A new place's parent, when it was started from *Add a place inside*. */
  readonly parentId?: LocationId;
  readonly onClose: () => void;
  readonly onSaved: (saved: Location) => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    place === undefined
      ? {
          kind: "town",
          name: "",
          parent: parentId ?? TOP,
          description: "",
          appearance: "",
          notes: "",
        }
      : draftOf(place),
  );
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();
  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));

  const parents = useMemo(() => {
    const excluded = place === undefined ? new Set<LocationId>() : subtreeIds(places, place.id);
    return places.filter((candidate) => !excluded.has(candidate.id));
  }, [place, places]);
  const problem = draft.name.trim() === "" ? "Give the place a name." : undefined;

  const save = async () => {
    setShowProblems(true);
    if (problem !== undefined) return;
    const saved = await submit(
      (client) =>
        place === undefined
          ? client.libraryLocations.create({
              payload: {
                kind: draft.kind,
                name: draft.name.trim(),
                ...(draft.parent === TOP ? {} : { parentId: draft.parent as LocationId }),
                ...(prose(draft.description) === undefined
                  ? {}
                  : { description: prose(draft.description)! }),
                ...(prose(draft.appearance) === undefined
                  ? {}
                  : { appearance: prose(draft.appearance)! }),
                ...(prose(draft.notes) === undefined ? {} : { notes: prose(draft.notes)! }),
              },
            })
          : client.libraryLocations.update({
              params: { locationId: place.id },
              payload: {
                kind: draft.kind,
                name: draft.name.trim(),
                parentId: draft.parent === TOP ? null : (draft.parent as LocationId),
                description: prose(draft.description) ?? null,
                appearance: prose(draft.appearance) ?? null,
                notes: prose(draft.notes) ?? null,
              },
            }),
      // Every table and world reading the place answers this key too.
      [reads.libraryLocations],
    );
    if (Result.isSuccess(saved)) onSaved(saved.success);
  };

  const title = place === undefined ? "New place" : `Edit ${place.name}`;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={title} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            A place in your Library. Put it into a campaign from the campaign’s Locations, and every
            campaign in that Shared World has it; your notes stay yours.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <div className="grid gap-4 @md:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Name" htmlFor="location-name" error={showProblems ? problem : undefined}>
              <Input
                id="location-name"
                maxLength={LOCATION_NAME_MAX}
                value={draft.name}
                onChange={(event) => set("name")(event.target.value)}
              />
            </Field>
            <Field label="Kind" htmlFor="location-kind">
              <Select
                value={draft.kind}
                onValueChange={(value) => set("kind")(value as LocationKind)}
              >
                <SelectTrigger id="location-kind" className="min-w-40">
                  <SelectValue>
                    {(value) => LOCATION_KIND_LABELS[value as LocationKind]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {LOCATION_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Inside" htmlFor="location-parent">
            <Select value={draft.parent} onValueChange={(value) => set("parent")(String(value))}>
              <SelectTrigger id="location-parent" className="w-full">
                <SelectValue>
                  {(value) =>
                    value === TOP
                      ? "Stands on its own"
                      : (parents.find((candidate) => candidate.id === value)?.name ??
                        "Stands on its own")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOP}>Stands on its own</SelectItem>
                {parents.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Description"
            htmlFor="location-description"
            hint="What a visitor finds there. A campaign’s players are shown it once you reveal the place."
          >
            <Textarea
              id="location-description"
              maxLength={LOCATION_DESCRIPTION_MAX}
              value={draft.description}
              onChange={(event) => set("description")(event.target.value)}
            />
          </Field>
          <Field
            label="Appearance"
            htmlFor="location-appearance"
            hint="What it looks like from above, in a line or two."
          >
            <Textarea
              id="location-appearance"
              className="min-h-16"
              maxLength={LOCATION_APPEARANCE_MAX}
              value={draft.appearance}
              onChange={(event) => set("appearance")(event.target.value)}
            />
          </Field>
          <section
            aria-label="Your notes"
            className="flex flex-col gap-4 rounded-card border border-strong bg-surface-sunken p-4"
          >
            <SectionHeading as="h3" className="flex items-center gap-2">
              <Icon name="lock" size={14} className="text-faint" />
              Your notes
            </SectionHeading>
            <Field
              label="Notes"
              htmlFor="location-notes"
              hint="Only you read these: not the players, and not other creators in a Shared World."
            >
              <Textarea
                id="location-notes"
                maxLength={LOCATION_NOTES_MAX}
                value={draft.notes}
                onChange={(event) => set("notes")(event.target.value)}
              />
            </Field>
          </section>
        </div>
        <DialogFooter>
          {failure !== undefined && <SaveFailure failure={failure} />}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save place"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
