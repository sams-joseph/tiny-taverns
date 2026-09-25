import {
  ABILITY_KEYS,
  type AbilityKey,
  type CampaignId,
  type Creature,
  type CreatureId,
  type Encounter,
  type EncounterId,
  type EncounterKind,
  ENCOUNTER_HAZARD_TEXT_MAX,
  ENCOUNTER_KINDS,
  ENCOUNTER_SETTING_MAX,
  ENCOUNTER_TREASURE_MAX,
  encounterKindLabel,
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
  Loading,
  Toggle,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { useCallback, useState } from "react";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea, VisibilityField } from "../ui/form";
import { CreaturePicker } from "./CreaturePicker";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import {
  addCreature,
  createPayload,
  draftFrom,
  type EncounterDraft,
  lineFor,
  MAX_COUNT,
  MIN_COUNT,
  NEW_ENCOUNTER,
  removeLine,
  rosterDiff,
  type RosterLine,
  type SavedEncounter,
  skillChips,
  toggleSkill,
  updatePayload,
  validate,
  withCount,
} from "./encounterDraft";

/**
 * Writing an encounter: the card's own fields, and what is in it. What the
 * form holds and what a save sends are `encounterDraft.ts`; this is the view
 * over it.
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
 * ### The setting line is the map's, and only the creator's
 *
 * *What the place looks like* is written here because the encounter's battle
 * map is made with it and drawn from it once, as the encounter is created. It
 * is stored on the map, not the encounter — a player may read a shared
 * encounter, and nobody but the creator reads its map — so an edit reads it
 * back through the creator's map read (`battleMaps.find`) and writes it through
 * the encounter's own update. Changing it later redraws nothing.
 *
 * ### The prep is the creator's too
 *
 * The tactics, the treasure and a skill challenge's or a hazard's numbers are
 * `EncounterPrep`: written through the encounter's create and update like the
 * setting line, and read back through the creator's prep read
 * (`encounterPrep.find`), never off `Encounter`. The numbers are asked for
 * only when the type takes them, and a challenge is sent with the type it
 * belongs to — the wire refuses one without it — so switching the type away
 * sends none and the server clears what was there.
 *
 * ### What is deliberately not here
 *
 * A roster line carries a `visibility` of its own and this form does not offer
 * it. Omitting the field is not the same as guessing at one: the column default
 * is `dm`, so every line starts closed exactly as the server intends, and a
 * second visibility control inside the first one is a boundary a DM would get
 * wrong more often than they got it right.
 */

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

/** A challenge's skills as chips over the standard list, capped where the wire caps them. */
function SkillChips({
  draft,
  onChange,
  error,
}: {
  readonly draft: {
    readonly skills: ReadonlyArray<string>;
    readonly offered: ReadonlyArray<string>;
  };
  readonly onChange: (skills: ReadonlyArray<string>) => void;
  readonly error: string | undefined;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="pb-1.5 text-label leading-snug font-medium text-heading">
        Skills that help
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {skillChips(draft).map((chip) => (
          <Toggle
            key={chip.name}
            size="sm"
            pressed={chip.pressed}
            disabled={chip.disabled}
            onPressedChange={() => onChange(toggleSkill(draft.skills, chip.name))}
          >
            {chip.name}
          </Toggle>
        ))}
      </div>
      {error !== undefined && (
        <span role="alert" className="text-caption leading-body text-danger-ink">
          {error}
        </span>
      )}
    </fieldset>
  );
}

function EncounterForm({
  campaignId,
  encounter,
  saved,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  readonly encounter: Encounter | undefined;
  /** What the form opens on, and what its save is measured against. */
  readonly saved: SavedEncounter;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(saved));
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const patch = (next: Partial<EncounterDraft>) => setDraft((current) => ({ ...current, ...next }));
  const setRoster = useCallback(
    (next: (roster: ReadonlyArray<RosterLine>) => ReadonlyArray<RosterLine>) =>
      setDraft((current) => ({ ...current, roster: next(current.roster) })),
    [],
  );

  const problems = validate(draft);
  const refused = Object.keys(problems).length > 0;

  const pick = useCallback(
    (creature: Creature) => setRoster((roster) => addCreature(roster, lineFor(creature))),
    [setRoster],
  );

  const save = async () => {
    setShowProblems(true);
    if (refused) return;

    const diff = rosterDiff(saved.roster, draft.roster);
    const result = await submit(
      (client) =>
        Effect.gen(function* () {
          const written =
            encounter === undefined
              ? yield* client.encounters.create({
                  params: { campaignId },
                  payload: createPayload(draft),
                })
              : yield* client.encounters.update({
                  params: { campaignId, encounterId: encounter.id },
                  payload: updatePayload(draft, saved),
                });

          const encounterId = written.id;

          // Removals first: a creature's row on its way out is still the row a
          // create for the same creature would be refused against.
          yield* Effect.all(
            diff.remove.map((encounterCreatureId) =>
              client.encounterCreatures.remove({
                params: { campaignId, encounterId, encounterCreatureId },
              }),
            ),
            { concurrency: "unbounded" },
          );

          yield* Effect.all(
            [
              ...diff.create.map((payload) =>
                client.encounterCreatures.create({ params: { campaignId, encounterId }, payload }),
              ),
              ...diff.update.map(({ id, count }) =>
                client.encounterCreatures.update({
                  params: { campaignId, encounterId, encounterCreatureId: id },
                  payload: { count },
                }),
              ),
            ],
            { concurrency: "unbounded" },
          );

          return written;
        }),
      // **`Encounter.creatureCount` is `sum(encounter_creature.count)`,
      // computed per read.** So the roster half of this save moves a number on
      // the Encounters list without the encounter row ever being sent — which is
      // exactly the shape of write this design has to be careful about, and why
      // the roster and the encounter are one key rather than two.
      [reads.encounters(campaignId)],
    );

    if (Result.isSuccess(result)) onSaved();
  };

  const chosen = new Set<CreatureId>(draft.roster.map((line) => line.creatureId));
  const total = draft.roster.reduce(
    (sum, line) => sum + (Number.isFinite(line.count) ? line.count : 0),
    0,
  );
  const { skillChallenge: skill, hazard } = draft;

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
            value={draft.name}
            aria-invalid={showProblems && problems.name !== undefined}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>

        <Field label="Type" htmlFor="encounter-kind">
          <Select
            value={draft.kind}
            onValueChange={(value) => patch({ kind: value as EncounterKind })}
          >
            <SelectTrigger id="encounter-kind">
              <SelectValue>{(value) => encounterKindLabel(value as EncounterKind)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ENCOUNTER_KINDS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="What the place looks like"
          htmlFor="encounter-setting"
          hint={
            encounter === undefined
              ? "One line on the ground the fight is on, with no creatures in it. Hob draws the battle map from it once, as the encounter is made. Only you see the map."
              : "The battle map was drawn once, when the encounter was made; changing this does not redraw it. Only you see it."
          }
          error={showProblems ? problems.setting : undefined}
        >
          <Input
            id="encounter-setting"
            maxLength={ENCOUNTER_SETTING_MAX}
            placeholder="A boardwalk over black water, reed beds on both sides"
            value={draft.setting}
            aria-invalid={showProblems && problems.setting !== undefined}
            onChange={(event) => patch({ setting: event.target.value })}
          />
        </Field>

        {draft.kind === "challenge" && (
          <fieldset className="flex flex-col gap-3">
            <legend className="pb-1 text-label leading-snug font-medium text-heading">
              The challenge
            </legend>
            <div className="grid grid-cols-3 gap-2.5">
              <Field label="DC" htmlFor="challenge-dc">
                <Input
                  id="challenge-dc"
                  mono
                  type="number"
                  min={1}
                  max={30}
                  placeholder="14"
                  value={skill.dc}
                  onChange={(event) =>
                    patch({ skillChallenge: { ...skill, dc: event.target.value } })
                  }
                />
              </Field>
              <Field label="Successes" htmlFor="challenge-successes">
                <Input
                  id="challenge-successes"
                  mono
                  type="number"
                  min={1}
                  max={20}
                  placeholder="3"
                  value={skill.successes}
                  onChange={(event) =>
                    patch({ skillChallenge: { ...skill, successes: event.target.value } })
                  }
                />
              </Field>
              <Field label="Failures" htmlFor="challenge-failures">
                <Input
                  id="challenge-failures"
                  mono
                  type="number"
                  min={1}
                  max={20}
                  placeholder="2"
                  value={skill.failures}
                  onChange={(event) =>
                    patch({ skillChallenge: { ...skill, failures: event.target.value } })
                  }
                />
              </Field>
            </div>
            <SkillChips
              draft={skill}
              onChange={(skills) => patch({ skillChallenge: { ...skill, skills } })}
              error={showProblems ? problems.challenge : undefined}
            />
          </fieldset>
        )}

        {draft.kind === "hazard" && (
          <fieldset className="flex flex-col gap-3">
            <legend className="pb-1 text-label leading-snug font-medium text-heading">
              The hazard
            </legend>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Saving throw" htmlFor="hazard-ability">
                <Select
                  value={hazard.ability}
                  onValueChange={(value) =>
                    patch({ hazard: { ...hazard, ability: String(value) as AbilityKey | "" } })
                  }
                >
                  <SelectTrigger id="hazard-ability">
                    <SelectValue>
                      {(value) => (value === "" ? "Choose one" : String(value))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ABILITY_KEYS.map((ability) => (
                      <SelectItem key={ability} value={ability}>
                        {ability}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Save DC" htmlFor="hazard-dc">
                <Input
                  id="hazard-dc"
                  mono
                  type="number"
                  min={1}
                  max={30}
                  value={hazard.dc}
                  onChange={(event) => patch({ hazard: { ...hazard, dc: event.target.value } })}
                />
              </Field>
            </div>
            <Field label="On a failed save" htmlFor="hazard-on-fail">
              <Input
                id="hazard-on-fail"
                maxLength={ENCOUNTER_HAZARD_TEXT_MAX}
                placeholder="1 level of exhaustion"
                value={hazard.onFail}
                onChange={(event) => patch({ hazard: { ...hazard, onFail: event.target.value } })}
              />
            </Field>
            <Field label="Duration" htmlFor="hazard-duration">
              <Input
                id="hazard-duration"
                maxLength={ENCOUNTER_HAZARD_TEXT_MAX}
                placeholder="1d4 hours"
                value={hazard.duration}
                onChange={(event) => patch({ hazard: { ...hazard, duration: event.target.value } })}
              />
            </Field>
            <SkillChips
              draft={hazard}
              onChange={(skills) => patch({ hazard: { ...hazard, skills } })}
              error={showProblems ? problems.challenge : undefined}
            />
          </fieldset>
        )}

        <Field
          label="Tags"
          htmlFor="encounter-tags"
          hint="Separated by commas — Marsh, Night, Boss."
          error={showProblems ? problems.tags : undefined}
        >
          <Input
            id="encounter-tags"
            placeholder="Marsh, Night"
            value={draft.tags}
            aria-invalid={showProblems && problems.tags !== undefined}
            onChange={(event) => patch({ tags: event.target.value })}
          />
        </Field>

        <VisibilityField
          id="encounter-visibility"
          value={draft.visibility}
          onChange={(visibility) => patch({ visibility })}
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

          {draft.roster.length === 0 ? (
            <p className="text-body-s leading-body text-muted-foreground">
              Nothing in it yet. Search below and add what the party runs into.
            </p>
          ) : (
            <ul className="flex flex-col rounded-md border border-hairline">
              {draft.roster.map((line) => (
                <RosterRow
                  key={line.creatureId}
                  line={line}
                  onCount={(count) =>
                    setRoster((roster) => withCount(roster, line.creatureId, count))
                  }
                  onRemove={() => setRoster((roster) => removeLine(roster, line.creatureId))}
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

        <Field
          label="Tactics"
          htmlFor="encounter-tactics"
          hint="How you mean to run it, one beat per line, in order. Only you see these."
          error={showProblems ? problems.tactics : undefined}
        >
          <Textarea
            id="encounter-tactics"
            placeholder="Archers open from the reeds with full cover."
            value={draft.tactics}
            aria-invalid={showProblems && problems.tactics !== undefined}
            onChange={(event) => patch({ tactics: event.target.value })}
          />
        </Field>

        <Field
          label="Treasure"
          htmlFor="encounter-treasure"
          hint="What the party can come away with. Only you see it."
          error={showProblems ? problems.treasure : undefined}
        >
          <Input
            id="encounter-treasure"
            maxLength={ENCOUNTER_TREASURE_MAX}
            placeholder="28 sp and a bone whistle"
            value={draft.treasure}
            onChange={(event) => patch({ treasure: event.target.value })}
          />
        </Field>
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

/**
 * What an edit starts from beyond the `Encounter` itself: its roster, its
 * map's setting line and its prep, keyed on the campaign and the encounter — or on
 * `undefined`, which is a new encounter, an empty list and no line rather than
 * a request.
 *
 * The name rides on the row itself (`EncounterCreature.name`, resolved
 * server-side), and that is load-bearing rather than convenient: a roster line
 * may point at a campaign instance the corpus list never returns — the
 * instancing decision of 2026-09-02 — so a client-side join against
 * `creatures.list` would name some lines "unknown" about creatures that are
 * right there.
 */
const formAtom = Atom.family(
  ({
    campaignId,
    encounterId,
  }: {
    readonly campaignId: CampaignId;
    readonly encounterId: EncounterId | undefined;
  }) =>
    apiAtom(
      (client) =>
        encounterId === undefined
          ? Effect.succeed<Omit<SavedEncounter, "encounter">>(NEW_ENCOUNTER)
          : Effect.map(
              Effect.all(
                {
                  roster: client.encounterCreatures.list({ params: { campaignId, encounterId } }),
                  map: client.battleMaps.find({ params: { campaignId, encounterId } }),
                  prep: client.encounterPrep.find({ params: { campaignId, encounterId } }),
                },
                { concurrency: "unbounded" },
              ),
              // This form writes no read-aloud; the builder page that replaces it does.
              ({ roster, map, prep }): Omit<SavedEncounter, "encounter"> => ({
                roster,
                setting: map.setting ?? "",
                prep,
                readAloud: undefined,
              }),
            ),
      // This encounter's own roster and setting line. `reads.encounters` is
      // what a roster write already names — for the `creatureCount` on the
      // card — and what this form's save names, so a save reaching these too
      // costs nothing and keeps a reopened dialog honest.
      encounterId === undefined ? [] : [reads.encounters(campaignId)],
    ),
);

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
   * The roster, the setting line and the prep, composed into one Effect for the
   * reason `campaign/load.ts` gives: three hooks here would be more states to
   * render inside a dialog that has room for one.
   */
  const [loaded, reload] = useApiAtom(formAtom({ campaignId, encounterId }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={encounter === undefined ? "New encounter" : "Edit encounter"}>
        {loaded.state === "loading" && (
          <div className="px-gutter py-gutter">
            <Loading label="Reading the encounter…" />
          </div>
        )}
        {loaded.state === "failed" && (
          <div className="px-gutter py-gutter">
            <ApiFailureNotice failure={loaded.failure} onRetry={reload} />
          </div>
        )}
        {loaded.state === "ready" && (
          <EncounterForm
            campaignId={campaignId}
            encounter={encounter}
            saved={{ ...loaded.value, encounter }}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
