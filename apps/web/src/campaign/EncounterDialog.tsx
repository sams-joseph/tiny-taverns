import type {
  CampaignId,
  CreatureId,
  Difficulty,
  Encounter,
  EncounterCreatureId,
  Visibility,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useMutation } from "../api/mutation";
import { useApiResource } from "../api/resource";
import { Field, SaveFailure, VisibilityField } from "../ui/form";
import { FailureNotice, Loading } from "../ui/states";
import { CreaturePicker } from "./CreaturePicker";

/**
 * Writing an encounter: the card's own fields, and what is in it.
 *
 * ### The roster is part of this form, not a second screen
 *
 * "6 creatures" is `sum(encounter_creature.count)` computed per read
 * (`Encounter.creatureCount`), so an encounter authored without a roster is an
 * encounter whose card says nothing. The roster therefore lives in the same
 * dialog and is saved by the same button — but it is a *different table*, so the
 * save is several calls, composed into **one** `Effect` handed to one `submit`.
 * Two submits in a row would give this form two busy flags and a half-saved
 * encounter to explain.
 *
 * Creating is the ordering that makes it: there is no encounter id to hang a
 * roster line off until the encounter exists, so the create runs first and the
 * lines follow inside the same Effect. A failure part-way leaves the encounter
 * saved and the roster short, which is the honest outcome — the API has no
 * transaction across requests, and pretending otherwise by rolling back with
 * more requests would fail the same way one call later.
 *
 * ### What is deliberately not here
 *
 * A roster line carries a `visibility` of its own and this form does not offer
 * it. Omitting the field is not the same as guessing at one: the column default
 * is `dm`, so every line starts closed exactly as the server intends, and a
 * second visibility control inside the first one is a boundary a DM would get
 * wrong more often than they got it right.
 */

/** One line of the roster, before and after it has an id. */
interface RosterLine {
  /** Stable across renders — a new line has no id to key on yet. */
  readonly key: string;
  /** `undefined` until the line has been saved. */
  readonly id: EncounterCreatureId | undefined;
  readonly creatureId: CreatureId;
  readonly name: string;
  readonly count: number;
  /** What the server last stored, so an untouched line costs no request. */
  readonly savedCount: number | undefined;
}

/** The one value `difficulty` takes that is not a band. */
const UNRATED = "";

const BANDS: ReadonlyArray<Difficulty> = ["Easy", "Medium", "Hard", "Deadly"];

const MAX_TAGS = 16;
const MAX_TAG_LENGTH = 40;
const MIN_COUNT = 1;
const MAX_COUNT = 999;

/** `"Marsh, Night"` ⇄ `["Marsh", "Night"]`. Blanks and repeats fall out. */
const parseTags = (raw: string): ReadonlyArray<string> => {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim();
    if (tag !== "") seen.add(tag);
  }
  return [...seen];
};

interface Draft {
  readonly name: string;
  readonly difficulty: Difficulty | null;
  readonly tags: ReadonlyArray<string>;
  readonly visibility: Visibility;
}

/**
 * What the DM is told before anything is sent.
 *
 * The contract would catch every one of these on its own — the derived client
 * encodes through the same schema the handler decodes with, so a bad payload
 * fails locally with a `SchemaError` and never reaches the network. But
 * "Expected a value with a length of at least 1 at [\"name\"]" is a sentence
 * for whoever wrote the schema, not for whoever is naming an encounter. These
 * are the same rules, said in the room they are broken in; `SaveFailure` is
 * what renders the backstop if one is ever missed.
 */
const validate = (draft: Draft, lines: ReadonlyArray<RosterLine>) => {
  const problems: { name?: string; tags?: string; roster?: string } = {};

  if (draft.name.trim() === "") problems.name = "Give it a name.";

  if (draft.tags.length > MAX_TAGS) {
    problems.tags = `Sixteen tags is the most an encounter carries. That is ${draft.tags.length}.`;
  } else if (draft.tags.some((tag) => tag.length > MAX_TAG_LENGTH)) {
    problems.tags = `Keep each tag under ${MAX_TAG_LENGTH + 1} characters.`;
  }

  if (lines.some((line) => !Number.isInteger(line.count))) {
    problems.roster = "A count is a whole number of creatures.";
  } else if (lines.some((line) => line.count < MIN_COUNT || line.count > MAX_COUNT)) {
    problems.roster = `A count runs from ${MIN_COUNT} to ${MAX_COUNT}.`;
  }

  return problems;
};

function RosterRow({
  line,
  onCount,
  onRemove,
}: {
  readonly line: RosterLine;
  readonly onCount: (count: number) => void;
  readonly onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 border-t border-hairline px-3 py-2 first:border-t-0">
      <Icon name="skull" size={15} className="shrink-0 text-faint" />
      <span className="min-w-0 flex-1 truncate text-body-s leading-body text-foreground">
        {line.name}
      </span>
      <Input
        mono
        type="number"
        min={MIN_COUNT}
        max={MAX_COUNT}
        aria-label={`How many ${line.name}`}
        value={String(line.count)}
        onChange={(event) => onCount(Number(event.target.value))}
        className="h-control-sm w-20 shrink-0"
      />
      <Button variant="ghost" size="icon" aria-label={`Remove ${line.name}`} onClick={onRemove}>
        <Icon name="x" size={14} />
      </Button>
    </li>
  );
}

function EncounterForm({
  campaignId,
  encounter,
  initialRoster,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  readonly encounter: Encounter | undefined;
  readonly initialRoster: ReadonlyArray<RosterLine>;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [name, setName] = useState(encounter?.name ?? "");
  const [difficulty, setDifficulty] = useState<string>(encounter?.difficulty ?? UNRATED);
  const [tagText, setTagText] = useState(encounter?.tags.join(", ") ?? "");
  // `dm` for a new encounter: the column default, and the only safe one to fail to.
  const [visibility, setVisibility] = useState<Visibility>(encounter?.visibility ?? "dm");
  const [lines, setLines] = useState<ReadonlyArray<RosterLine>>(initialRoster);
  const [removed, setRemoved] = useState<ReadonlyArray<EncounterCreatureId>>([]);
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const draft: Draft = {
    name,
    difficulty: difficulty === UNRATED ? null : (difficulty as Difficulty),
    tags: parseTags(tagText),
    visibility,
  };
  const problems = validate(draft, lines);
  const refused = Object.keys(problems).length > 0;

  const pick = useCallback((creature: { readonly id: CreatureId; readonly name: string }) => {
    setLines((current) => [
      ...current,
      {
        key: `new-${creature.id}`,
        id: undefined,
        creatureId: creature.id,
        name: creature.name,
        // The column default is one. The DM raises it; nothing guesses a number.
        count: 1,
        savedCount: undefined,
      },
    ]);
  }, []);

  const drop = useCallback((line: RosterLine) => {
    setLines((current) => current.filter((other) => other.key !== line.key));
    // A line that was never saved has nothing to delete on the server.
    if (line.id !== undefined)
      setRemoved((current) => [...current, line.id as EncounterCreatureId]);
  }, []);

  const save = async () => {
    setShowProblems(true);
    if (refused) return;

    const trimmed = draft.name.trim();
    const saved = await submit((client) =>
      Effect.gen(function* () {
        const written =
          encounter === undefined
            ? // `difficulty` is `optional(Difficulty)` on create and
              // `optional(NullOr(Difficulty))` on update: an encounter has never
              // been rated, so unrated is an absent field rather than a null.
              yield* client.encounters.create({
                params: { campaignId },
                payload: {
                  name: trimmed,
                  ...(draft.difficulty === null ? {} : { difficulty: draft.difficulty }),
                  tags: draft.tags,
                  visibility: draft.visibility,
                },
              })
            : yield* client.encounters.update({
                params: { campaignId, encounterId: encounter.id },
                payload: {
                  name: trimmed,
                  difficulty: draft.difficulty,
                  tags: draft.tags,
                  visibility: draft.visibility,
                },
              });

        const encounterId = written.id;

        // Removals first: a line dropped and the same creature re-added in one
        // sitting would otherwise be a 409 against the row on its way out.
        yield* Effect.all(
          removed.map((encounterCreatureId) =>
            client.encounterCreatures.remove({
              params: { campaignId, encounterId, encounterCreatureId },
            }),
          ),
          { concurrency: "unbounded" },
        );

        yield* Effect.all(
          lines
            .filter((line) => line.id === undefined || line.count !== line.savedCount)
            .map((line) =>
              line.id === undefined
                ? client.encounterCreatures.create({
                    params: { campaignId, encounterId },
                    payload: { creatureId: line.creatureId, count: line.count },
                  })
                : client.encounterCreatures.update({
                    params: { campaignId, encounterId, encounterCreatureId: line.id },
                    payload: { count: line.count },
                  }),
            ),
          { concurrency: "unbounded" },
        );

        return written;
      }),
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  const chosen = new Set(lines.map((line) => line.creatureId));
  const total = lines.reduce(
    (sum, line) => sum + (Number.isFinite(line.count) ? line.count : 0),
    0,
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{encounter === undefined ? "New encounter" : "Edit encounter"}</DialogTitle>
        <DialogDescription>
          A template you can run any night. Running it never changes what is written here.
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
        <Field
          label="Name"
          htmlFor="encounter-name"
          error={showProblems ? problems.name : undefined}
        >
          <Input
            id="encounter-name"
            placeholder="Ambush in the reeds"
            value={name}
            aria-invalid={showProblems && problems.name !== undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Difficulty"
          htmlFor="encounter-difficulty"
          hint="The DMG band for the party, not a creature's challenge rating."
        >
          <Select value={difficulty} onValueChange={(value) => setDifficulty(String(value))}>
            <SelectTrigger id="encounter-difficulty">
              {/* The label is written here, not left to Base UI. `Select.Value`
                  with neither `items` nor children falls back to serialising
                  the *value* — so a select keyed on anything that is not
                  already its own label renders the raw string, and one keyed
                  on `""` renders nothing at all. Both were on screen before
                  this was a function. */}
              <SelectValue>
                {(value) => (value === UNRATED ? "Unrated" : String(value))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* Unrated is a state, not a missing value: a sketched encounter
                  the DM has not weighed yet is information, and the card says so. */}
              <SelectItem value={UNRATED}>Unrated</SelectItem>
              {BANDS.map((band) => (
                <SelectItem key={band} value={band}>
                  {band}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Tags"
          htmlFor="encounter-tags"
          hint="Separated by commas — Marsh, Night, Boss."
          error={showProblems ? problems.tags : undefined}
        >
          <Input
            id="encounter-tags"
            placeholder="Marsh, Night"
            value={tagText}
            aria-invalid={showProblems && problems.tags !== undefined}
            onChange={(event) => setTagText(event.target.value)}
          />
        </Field>

        <VisibilityField
          id="encounter-visibility"
          value={visibility}
          onChange={setVisibility}
          shared="Your players can see this encounter and its tags."
          hidden="Only you can see this encounter."
        />

        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2.5">
            <span className="text-label leading-snug font-medium text-heading">Creatures</span>
            <span className="font-mono text-mono leading-snug font-medium text-muted-foreground">
              {total} {total === 1 ? "creature" : "creatures"}
            </span>
          </div>

          {lines.length === 0 ? (
            <p className="text-body-s leading-body text-muted-foreground">
              Nothing in it yet. Search below and add what the party runs into.
            </p>
          ) : (
            <ul className="flex flex-col rounded-md border border-hairline">
              {lines.map((line) => (
                <RosterRow
                  key={line.key}
                  line={line}
                  onCount={(count) =>
                    setLines((current) =>
                      current.map((other) =>
                        other.key === line.key ? { ...other, count } : other,
                      ),
                    )
                  }
                  onRemove={() => drop(line)}
                />
              ))}
            </ul>
          )}
          {showProblems && problems.roster !== undefined && (
            <span role="alert" className="text-caption leading-body text-danger-ink">
              {problems.roster}
            </span>
          )}

          <CreaturePicker campaignId={campaignId} chosen={chosen} onPick={pick} />
        </div>
      </div>

      {/* The failure belongs in the footer, not at the end of the body: the body
          scrolls, and a form long enough to need scrolling is one where a line
          appended below the fold is a line the DM never sees. This sits beside
          the button they just pressed, which is where they are looking. */}
      <DialogFooter>
        {failure !== undefined && (
          <div className="mr-auto min-w-0 flex-1 text-left">
            <SaveFailure failure={failure} />
          </div>
        )}
        <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : encounter === undefined ? "Create encounter" : "Save changes"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EncounterDialog({
  campaignId,
  encounter,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  /** Absent for a new one. Present, and this edits it. */
  readonly encounter: Encounter | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const encounterId = encounter?.id;

  /**
   * The roster, and the names to render it by.
   *
   * Two calls rather than one: `encounter_creature` carries a `creatureId` and
   * no name — it is a roster line, not a copy of the creature — so the bestiary
   * is what turns an id into a row a DM recognises. Composed into one Effect for
   * the reason `campaign/load.ts` gives: two hooks here would be four states to
   * render inside a dialog that has room for one.
   */
  const load = useCallback(
    (client: TavernsClient) =>
      encounterId === undefined
        ? Effect.succeed<ReadonlyArray<RosterLine>>([])
        : Effect.gen(function* () {
            const [rows, creatures] = yield* Effect.all(
              [
                client.encounterCreatures.list({ params: { campaignId, encounterId } }),
                client.creatures.list({ params: { campaignId }, query: {} }),
              ],
              { concurrency: "unbounded" },
            );
            const byId = new Map(creatures.map((creature) => [creature.id, creature]));
            return rows.map((row): RosterLine => ({
              key: row.id,
              id: row.id,
              creatureId: row.creatureId,
              // A line whose creature this actor cannot read is still a line.
              // Say so rather than dropping it and silently shrinking the roster.
              name: byId.get(row.creatureId)?.name ?? "A creature you cannot see",
              count: row.count,
              savedCount: row.count,
            }));
          }),
    [campaignId, encounterId],
  );
  const [roster, reload] = useApiResource(load);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={encounter === undefined ? "New encounter" : "Edit encounter"}>
        {roster.state === "loading" && (
          <div className="px-gutter py-gutter">
            <Loading label="Reading the roster…" />
          </div>
        )}
        {roster.state === "failed" && (
          <div className="px-gutter py-gutter">
            <FailureNotice failure={roster.failure} onRetry={reload} />
          </div>
        )}
        {roster.state === "ready" && (
          <EncounterForm
            campaignId={campaignId}
            encounter={encounter}
            initialRoster={roster.value}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
