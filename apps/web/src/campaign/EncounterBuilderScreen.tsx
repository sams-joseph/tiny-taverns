import {
  ABILITY_KEYS,
  type AbilityKey,
  type CampaignId,
  type Creature,
  type Encounter,
  type EncounterId,
  ENCOUNTER_HAZARD_TEXT_MAX,
  ENCOUNTER_OUTCOME_MAX,
  ENCOUNTER_KINDS,
  ENCOUNTER_SETTING_MAX,
  ENCOUNTER_TREASURE_MAX,
  type Note,
  type PartySeat,
} from "@taverns/api";
import { Link, useBlocker, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Icon,
  Input,
  Label,
  SectionHeading,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Toggle,
} from "@taverns/ui";
import { DateTime, Effect, Result } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { apiAtom, useApiAtom, useInvalidate } from "../api/atoms";
import { reads } from "../api/keys";
import type { TavernsClient } from "../api/client";
import { useMutation } from "../api/mutation";
import { HobCover } from "../hob/HobCover";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { TopBar } from "../shell/TopBar";
import { Field, SaveFailure, Textarea, VisibilityField } from "../ui/form";
import { CampaignChrome, type CampaignExtraAtom } from "./CampaignChrome";
import { BuilderRail } from "./BuilderRail";
import {
  addCreature,
  createPayload,
  draftFrom,
  type EncounterDraft,
  lineFor,
  NEW_ENCOUNTER,
  readAloudOf,
  type ReadAloudWrite,
  readAloudWrite,
  removeLine,
  rosterDiff,
  type RosterLine,
  type SavedEncounter,
  skillChips,
  stepCount,
  toggleSkill,
  updatePayload,
  validate,
} from "./encounterDraft";
import { KIND_ICON } from "./encounterList";
import { encounterPageAtom, encounterPrepListAtom } from "./load";

/**
 * Writing an encounter, new or already made: the redesign's encounter builder
 * (`Campaign Overview.dc.html`), at `/encounters/new` and
 * `/encounters/<id>/edit`. Every way into writing one — the list's *New
 * encounter*, the preview's *Edit* and *Add creature*, the Overview's *Add
 * encounter* and its rows' *Edit*, the encounter page's *Edit* — lands here, so
 * there is one editor. What the form holds and what a save sends are
 * `encounterDraft.ts`; this is the view over it.
 *
 * ### A page, not a dialog
 *
 * It is a two-column form with a rail beside it — the roster on the left, the
 * bestiary it is added from on the right — which fits neither a modal at 390
 * nor one at 1440, and a DM building a fight wants the window's whole height
 * for it. The character create form is the precedent: a flow with its own
 * peach whose way out is *Cancel*, so the campaign row's press stands down on
 * both routes (`CampaignRow` in `shell/AppShell.tsx`) and there is no separate
 * back link.
 *
 * ### Two columns, or one in the order a DM works
 *
 * The container decides, not the window: from `@4xl` of content (the
 * drawing's `480px` form, its `24px` gap and a `340px` rail, rounded to the
 * scale) the rail stands beside the form; below it everything is one column
 * in the order the DM works down it — details, what is in it, then the rail
 * that adds to it, then how it is run. The drawing's own wrap put the rail
 * under the whole form, a screen or more below the roster it changes.
 *
 * ### Saving is one call for a new encounter
 *
 * The roster goes with the create (`EncounterCreate.creatures`), which the
 * server makes in one transaction, so a creature it refuses leaves no encounter
 * behind. An edit is the encounter's update and then the roster's per-line
 * writes — the lines already have rows — composed into one `Effect` for one
 * `submit`. Either way it lands on the list with the encounter selected.
 *
 * ### A kind switch never deletes a creature
 *
 * The creatures card is drawn for a fight and a conversation, and for a skill
 * challenge or a hazard whenever it has lines: switching a fight to a hazard
 * keeps the roster in view, where the DM can take it off by hand, rather than
 * hiding lines the save would still keep.
 *
 * ### Leaving asks first
 *
 * Unsaved changes are asked about before any navigation — *Cancel*, a tab, the
 * browser's back — through the router's blocker, and before the tab closes.
 * Nothing is drafted anywhere else: a draft that is left is gone.
 *
 * ### What is deliberately not here yet
 *
 * The *When* toggles are not drawn: nothing on the wire stores them.
 *
 * ### Read aloud is a note
 *
 * The *Read aloud* box edits the encounter's oldest attached `read_aloud`
 * note, which is where the preview and the Overview's opening read-aloud find
 * it. Any others attached to it are listed under the box, read-only, for Notes
 * to edit. What a save sends to the note is `readAloudWrite`'s; emptying the
 * box detaches the note rather than deleting it.
 *
 * A roster line carries a `visibility` of its own and this form does not offer
 * it: the column default is `dm`, so every line starts closed exactly as the
 * server intends.
 */
export function EncounterBuilderScreen() {
  const params = useParams({ strict: false });
  const campaignId = params.campaignId as CampaignId;
  const encounterId = params.encounterId;

  return (
    <CampaignChrome
      campaignId={campaignId}
      centred
      extra={builderAtom({ campaignId, encounterId })}
    >
      {({ view, extra }) => {
        if (encounterId === undefined) {
          return (
            <EncounterBuilder
              campaignId={campaignId}
              encounter={undefined}
              saved={{ ...extra, encounter: undefined, readAloud: undefined }}
              otherReadAloud={[]}
              partyLevels={partyLevelsOf(view.party)}
            />
          );
        }
        const encounter = view.encounters.find((row) => row.id === encounterId);
        if (encounter === undefined) {
          return (
            <>
              <TopBar title="Edit encounter" />
              <EmptyState icon="swords" title="No such encounter">
                It is not among this table&rsquo;s encounters any more.{" "}
                <Link
                  to="/campaigns/$campaignId/encounters"
                  params={{ campaignId }}
                  className="text-link hover:text-link-hover"
                >
                  All encounters
                </Link>
              </EmptyState>
            </>
          );
        }
        // The notes are the campaign view's, already read and answering
        // `reads.notes`, so the builder needs no read of its own for them.
        const readAloud = readAloudOf(view.notes, encounter.id);
        return (
          <EncounterBuilder
            campaignId={campaignId}
            encounter={encounter}
            saved={{ ...extra, encounter, readAloud }}
            otherReadAloud={otherReadAloud(view.notes, encounter.id, readAloud)}
            partyLevels={partyLevelsOf(view.party)}
          />
        );
      }}
    </CampaignChrome>
  );
}

type Stored = Omit<SavedEncounter, "encounter" | "readAloud">;

/** The encounter's read-aloud notes besides the one the box edits, oldest first. */
const otherReadAloud = (
  notes: ReadonlyArray<Note>,
  encounterId: EncounterId,
  edited: { readonly id: Note["id"] } | undefined,
): ReadonlyArray<Note> =>
  notes
    .filter(
      (note) =>
        note.kind === "read_aloud" && note.attachedTo?.id === encounterId && note.id !== edited?.id,
    )
    .sort((a, b) => DateTime.toEpochMillis(a.createdAt) - DateTime.toEpochMillis(b.createdAt));

/** The read-aloud half of a save, as a request or none. */
const writeReadAloud = (client: TavernsClient, campaignId: CampaignId, write: ReadAloudWrite) => {
  switch (write._tag) {
    case "none":
      return Effect.void;
    case "create":
      return client.notes.create({ params: { campaignId }, payload: write.payload });
    case "update":
      return client.notes.update({
        params: { campaignId, noteId: write.noteId },
        payload: { body: write.body },
      });
    case "detach":
      return client.notes.update({
        params: { campaignId, noteId: write.noteId },
        payload: { attachedTo: null },
      });
  }
};

/**
 * The levels the rail's difficulty is rated against: every live seat's
 * character, from the campaign view's `party.list` — the seats the server
 * rates a saved encounter against, so the two cannot disagree. A seat whose
 * character was deleted holds nobody.
 */
const partyLevelsOf = (party: ReadonlyArray<PartySeat>): ReadonlyArray<number | null> =>
  party.flatMap((seat) => (seat.character === null ? [] : [seat.character.level]));

/**
 * What the builder opens on beyond the `Encounter` row, which is the campaign
 * view's: its roster, its map's setting line and its prep, each read through
 * the creator's own read.
 *
 * **A new encounter reads the creator's prep list and nothing from it.** Every
 * other read a blank builder needs a player may also make, so without one the
 * page would draw a form to a player whose save the server refuses. The prep
 * list is the creator's alone, so a player gets the page's `NotFound`, as they
 * do on the encounter's own page; it is the list page's atom, so arriving from
 * the list costs nothing.
 *
 * The name of each roster line rides on the row (`EncounterCreature.name`,
 * resolved server-side), because a line may point at a campaign instance no
 * bestiary list returns.
 */
const builderAtom = Atom.family(
  ({
    campaignId,
    encounterId,
  }: {
    readonly campaignId: CampaignId;
    readonly encounterId: EncounterId | undefined;
  }): CampaignExtraAtom<Stored> =>
    encounterId === undefined
      ? Atom.readable((get) =>
          AsyncResult.map(get(encounterPrepListAtom(campaignId)), (): Stored => NEW_ENCOUNTER),
        )
      : apiAtom(
          (client) =>
            Effect.map(
              Effect.all(
                {
                  roster: client.encounterCreatures.list({ params: { campaignId, encounterId } }),
                  map: client.battleMaps.find({ params: { campaignId, encounterId } }),
                  prep: client.encounterPrep.find({ params: { campaignId, encounterId } }),
                },
                { concurrency: "unbounded" },
              ),
              ({ roster, map, prep }): Stored => ({
                roster,
                setting: map.setting ?? "",
                prep,
              }),
            ),
          // What the save names, so a builder opened again reads what was saved.
          [reads.encounters(campaignId)],
        ),
);

/** Where *Cancel* and a save go: the list, with this encounter selected when there is one. */
const listOf = (campaignId: CampaignId, encounterId: EncounterId | undefined) =>
  ({
    to: "/campaigns/$campaignId/encounters",
    params: { campaignId },
    search: encounterId === undefined ? {} : { encounter: encounterId },
  }) as const;

function EncounterBuilder({
  campaignId,
  encounter,
  saved,
  otherReadAloud,
  partyLevels,
}: {
  readonly campaignId: CampaignId;
  readonly encounter: Encounter | undefined;
  /** What the form opens on, and what its save is measured against. */
  readonly saved: SavedEncounter;
  /** Read-aloud notes on it beyond the one the box edits, shown and not edited. */
  readonly otherReadAloud: ReadonlyArray<Note>;
  readonly partyLevels: ReadonlyArray<number | null>;
}) {
  const [initial] = useState(() => draftFrom(saved));
  const [draft, setDraft] = useState(initial);
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();
  const navigate = useNavigate();
  const hash = useLocation({ select: (location) => location.hash });
  /** Where the page was opened: `#creatures` from the preview's *Add creature*. */
  const [arrivedAt] = useState(() => hash);

  const patch = (next: Partial<EncounterDraft>) => setDraft((current) => ({ ...current, ...next }));
  const setRoster = useCallback(
    (next: (roster: ReadonlyArray<RosterLine>) => ReadonlyArray<RosterLine>) =>
      setDraft((current) => ({ ...current, roster: next(current.roster) })),
    [],
  );
  const pick = useCallback(
    (creature: Creature) => setRoster((roster) => addCreature(roster, lineFor(creature))),
    [setRoster],
  );

  /**
   * Unsaved changes: anything that differs from what the page opened on. The
   * draft is plain data — strings, numbers, arrays of them — so its JSON is
   * its value.
   */
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  /** Set once a save has landed, so the way to the list is not asked about. */
  const leaving = useRef(false);
  /**
   * The encounter a new builder's save made, once it has. The read-aloud note
   * can only be written after it, so a note refused after the encounter was
   * made leaves this set, and *Save* again writes the note rather than a
   * second encounter.
   */
  const made = useRef<Encounter | undefined>(undefined);
  const shouldBlock = useCallback(() => !leaving.current, []);
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock,
    enableBeforeUnload: shouldBlock,
    disabled: !dirty,
    withResolver: true,
  });

  // *Add creature* on the preview opens this page at `#creatures`. The card is
  // drawn only once the reads have answered, after the router has looked for it.
  // Once, on arriving: a hash the DM scrolls away from is not a place to return to.
  useEffect(() => {
    const card = arrivedAt === "creatures" ? document.getElementById("creatures") : null;
    // jsdom lays nothing out and has no `scrollIntoView` at all.
    if (card !== null && typeof card.scrollIntoView === "function") card.scrollIntoView();
  }, [arrivedAt]);

  const problems = validate(draft);
  const refused = Object.keys(problems).length > 0;
  const shown = <K extends keyof typeof problems>(key: K) =>
    showProblems ? problems[key] : undefined;

  const save = async () => {
    setShowProblems(true);
    if (refused) return;

    // Whether the save touches a note, so the notes are re-read only when one moved.
    const touchesNote =
      encounter === undefined
        ? draft.readAloud.trim() !== ""
        : readAloudWrite(draft, saved.readAloud, encounter.id)._tag !== "none";

    const result = await submit(
      (client) =>
        encounter === undefined
          ? Effect.gen(function* () {
              const written =
                made.current ??
                (yield* client.encounters.create({
                  params: { campaignId },
                  payload: createPayload(draft),
                }));
              made.current = written;
              // After the encounter: the note is attached to it by id.
              yield* writeReadAloud(
                client,
                campaignId,
                readAloudWrite(draft, undefined, written.id),
              );
              return written;
            })
          : Effect.gen(function* () {
              const encounterId = encounter.id;
              const written = yield* client.encounters.update({
                params: { campaignId, encounterId },
                payload: updatePayload(draft, saved),
              });
              const diff = rosterDiff(saved.roster, draft.roster);
              // Removals first: a creature's row on its way out is still the row
              // a create for the same creature would be refused against.
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
                    client.encounterCreatures.create({
                      params: { campaignId, encounterId },
                      payload,
                    }),
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
              yield* writeReadAloud(
                client,
                campaignId,
                readAloudWrite(draft, saved.readAloud, encounterId),
              );
              return written;
            }),
      // **`Encounter.creatureCount` and its difficulty are computed per read
      // from the roster**, so the roster half of a save moves numbers on the list
      // the encounter row was never sent for — and the prep, the map's setting
      // line and the roster all answer this one key. A read-aloud is a note,
      // found over the notes by the preview and the Overview, so a save that
      // wrote one names the notes too.
      touchesNote
        ? [reads.encounters(campaignId), reads.notes(campaignId)]
        : [reads.encounters(campaignId)],
    );

    if (Result.isSuccess(result)) {
      leaving.current = true;
      // Replacing the builder: *Back* from the list goes where the DM came from,
      // not into a blank form again.
      await navigate({ ...listOf(campaignId, result.success.id), replace: true });
    }
  };

  const total = draft.roster.reduce(
    (sum, line) => sum + (Number.isFinite(line.count) ? line.count : 0),
    0,
  );
  const takesChallenge = draft.kind === "challenge" || draft.kind === "hazard";
  const showCreatures = !takesChallenge || draft.roster.length > 0;
  const { skillChallenge: skill, hazard } = draft;

  return (
    <>
      <TopBar
        title={encounter === undefined ? "New encounter" : "Edit encounter"}
        subtitle={
          encounter === undefined
            ? "A template you can run any night. Running it never changes what is written here."
            : encounter.name
        }
      >
        <div className="flex items-center gap-2">
          <Switch
            id="encounter-ready"
            checked={draft.ready}
            onCheckedChange={(ready) => patch({ ready })}
          />
          <Label htmlFor="encounter-ready" className="whitespace-nowrap">
            Ready to run
          </Label>
        </div>
        <Button
          variant="secondary"
          size="sm"
          nativeButton={false}
          render={<Link {...listOf(campaignId, encounter?.id)} />}
        >
          Cancel
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          <Icon name="check" size={13} />
          {busy ? "Saving…" : "Save encounter"}
        </Button>
      </TopBar>

      {/* Beside the button just pressed, which is at the top of the page: the
          page scrolls with the window, so the header is where the DM is. */}
      {(failure !== undefined || (showProblems && refused)) && (
        <div className="mb-5">
          {failure !== undefined ? (
            <SaveFailure failure={failure} />
          ) : (
            <p role="alert" className="text-body-s leading-body text-danger">
              Some of this will not save as it is. Each field that needs a change says so.
            </p>
          )}
        </div>
      )}

      <div className="@container">
        <div
          data-slot="encounter-builder"
          className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @4xl:grid-rows-[auto_auto_1fr] @4xl:gap-x-6"
        >
          <BuilderCard className="@4xl:col-start-1 @4xl:row-start-1">
            <Field label="Name" htmlFor="encounter-name" error={shown("name")}>
              <Input
                id="encounter-name"
                placeholder="What you call it, e.g. Ambush in the reeds"
                value={draft.name}
                aria-invalid={shown("name") !== undefined}
                onChange={(event) => patch({ name: event.target.value })}
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span
                id="encounter-kind"
                className="text-label leading-snug font-medium text-heading"
              >
                Type
              </span>
              <div
                role="group"
                aria-labelledby="encounter-kind"
                className="flex flex-wrap items-center gap-1.5"
              >
                {ENCOUNTER_KINDS.map(([kind, label]) => (
                  <Toggle
                    key={kind}
                    size="sm"
                    pressed={draft.kind === kind}
                    onPressedChange={() => patch({ kind })}
                  >
                    <Icon name={KIND_ICON[kind]} size={13} />
                    {label}
                  </Toggle>
                ))}
              </div>
            </div>

            <Field
              label="Read aloud"
              htmlFor="encounter-read-aloud"
              hint="What you say to the table when it starts."
            >
              <Textarea
                id="encounter-read-aloud"
                rows={3}
                placeholder="The reeds are taller than you are and they are not moving."
                value={draft.readAloud}
                className="font-serif text-body-l leading-loose italic"
                onChange={(event) => patch({ readAloud: event.target.value })}
              />
            </Field>

            {otherReadAloud.length > 0 && (
              <OtherReadAloud campaignId={campaignId} notes={otherReadAloud} />
            )}

            <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
              <div className="min-w-0 flex-1 basis-60">
                <Field
                  label="Tags"
                  htmlFor="encounter-tags"
                  hint="Separated by commas — Marsh, Night, Boss."
                  error={shown("tags")}
                >
                  <Input
                    id="encounter-tags"
                    placeholder="Marsh, Night"
                    value={draft.tags}
                    aria-invalid={shown("tags") !== undefined}
                    onChange={(event) => patch({ tags: event.target.value })}
                  />
                </Field>
              </div>
              <div className="min-w-0 flex-1 basis-60 pt-1">
                <VisibilityField
                  id="encounter-visibility"
                  value={draft.visibility}
                  onChange={(visibility) => patch({ visibility })}
                  shared={
                    draft.ready
                      ? "Your players can see this encounter and its tags."
                      : "Your players see it once you mark it Ready to run. Until then it stays yours."
                  }
                  hidden="Only you can see this encounter."
                />
              </div>
            </div>
          </BuilderCard>

          <div className="flex min-w-0 flex-col gap-5 @4xl:col-start-1 @4xl:row-start-2">
            <BattleMapCard campaignId={campaignId} encounterId={encounter?.id}>
              <Field
                label="Location"
                htmlFor="encounter-setting"
                hint={
                  encounter === undefined
                    ? "One line on the ground it happens on, with no creatures in it. Hob draws the battle map from it once, as the encounter is made. Only you see the map."
                    : "The battle map was drawn once, when the encounter was made; changing this does not redraw it. Only you see it."
                }
                error={shown("setting")}
              >
                <Input
                  id="encounter-setting"
                  maxLength={ENCOUNTER_SETTING_MAX}
                  placeholder="Where it happens"
                  value={draft.setting}
                  aria-invalid={shown("setting") !== undefined}
                  onChange={(event) => patch({ setting: event.target.value })}
                />
              </Field>
            </BattleMapCard>

            {showCreatures && (
              <Card
                id="creatures"
                role="region"
                aria-labelledby="creatures-heading"
                className="scroll-mt-(--chrome-height) overflow-hidden"
              >
                <div className="flex items-baseline gap-2.5 border-b border-hairline px-5 py-4">
                  <SectionHeading id="creatures-heading" size="title">
                    Creatures
                  </SectionHeading>
                  <span className="font-mono text-mono leading-none font-medium text-muted-foreground">
                    {total}
                  </span>
                </div>
                {draft.roster.length === 0 ? (
                  <p className="mb-0 px-5 py-7 text-center text-body-s leading-body text-muted-foreground">
                    No creatures yet. Add them from the bestiary.
                  </p>
                ) : (
                  <ul data-slot="encounter-roster" className="m-0 flex list-none flex-col p-0">
                    {draft.roster.map((line) => (
                      <RosterRow
                        key={line.creatureId}
                        line={line}
                        onStep={(by) =>
                          setRoster((roster) => stepCount(roster, line.creatureId, by))
                        }
                        onRemove={() => setRoster((roster) => removeLine(roster, line.creatureId))}
                      />
                    ))}
                  </ul>
                )}
                {shown("roster") !== undefined && (
                  <p
                    role="alert"
                    className="mb-0 border-t border-hairline px-5 py-3 text-caption leading-body text-danger-ink"
                  >
                    {shown("roster")}
                  </p>
                )}
              </Card>
            )}

            {draft.kind === "challenge" && (
              <BuilderCard title="Skill challenge">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-4">
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
                  <Field label="Successes needed" htmlFor="challenge-successes">
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
                  <Field label="Failures allowed" htmlFor="challenge-failures">
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
                <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
                  <Field label="If they make it" htmlFor="challenge-on-success">
                    <Input
                      id="challenge-on-success"
                      maxLength={ENCOUNTER_OUTCOME_MAX}
                      placeholder="They find the buried cache"
                      value={skill.onSuccess}
                      onChange={(event) =>
                        patch({ skillChallenge: { ...skill, onSuccess: event.target.value } })
                      }
                    />
                  </Field>
                  <Field label="If it goes wrong" htmlFor="challenge-on-failure">
                    <Input
                      id="challenge-on-failure"
                      maxLength={ENCOUNTER_OUTCOME_MAX}
                      placeholder="The rope snaps, and the well is lost"
                      value={skill.onFailure}
                      onChange={(event) =>
                        patch({ skillChallenge: { ...skill, onFailure: event.target.value } })
                      }
                    />
                  </Field>
                </div>
                <SkillChips
                  draft={skill}
                  onChange={(skills) => patch({ skillChallenge: { ...skill, skills } })}
                  error={shown("challenge")}
                />
              </BuilderCard>
            )}

            {draft.kind === "hazard" && (
              <BuilderCard title="Hazard">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-4">
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
                      placeholder="13"
                      value={hazard.dc}
                      onChange={(event) => patch({ hazard: { ...hazard, dc: event.target.value } })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
                  <Field label="On a failed save" htmlFor="hazard-on-fail">
                    <Input
                      id="hazard-on-fail"
                      maxLength={ENCOUNTER_HAZARD_TEXT_MAX}
                      placeholder="1 level of exhaustion"
                      value={hazard.onFail}
                      onChange={(event) =>
                        patch({ hazard: { ...hazard, onFail: event.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Duration" htmlFor="hazard-duration">
                    <Input
                      id="hazard-duration"
                      maxLength={ENCOUNTER_HAZARD_TEXT_MAX}
                      placeholder="1d4 hours"
                      value={hazard.duration}
                      onChange={(event) =>
                        patch({ hazard: { ...hazard, duration: event.target.value } })
                      }
                    />
                  </Field>
                </div>
                <SkillChips
                  draft={hazard}
                  onChange={(skills) => patch({ hazard: { ...hazard, skills } })}
                  error={shown("challenge")}
                />
              </BuilderCard>
            )}
          </div>

          {/* The rail, as tall as the form so its difficulty card stays pinned
              while the DM writes further down. `isolate`: the pinned card is
              above the bestiary scrolling under it, and the whole rail below the
              chrome it pins under. */}
          <aside
            aria-label={takesChallenge ? "Setting the DC" : "Difficulty and bestiary"}
            data-slot="encounter-builder-rail"
            className="isolate flex min-w-0 flex-col gap-5 self-stretch @4xl:col-start-2 @4xl:row-span-3 @4xl:row-start-1"
          >
            <BuilderRail
              campaignId={campaignId}
              takesChallenge={takesChallenge}
              roster={draft.roster}
              partyLevels={partyLevels}
              onPick={pick}
            />
          </aside>

          <BuilderCard className="@4xl:col-start-1 @4xl:row-start-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <Label htmlFor="encounter-tactics">Running it</Label>
                <span className="text-caption leading-none text-faint">One beat per line</span>
              </div>
              <Textarea
                id="encounter-tactics"
                rows={4}
                placeholder="How the creatures fight, what they want, when they run."
                value={draft.tactics}
                aria-invalid={shown("tactics") !== undefined}
                aria-describedby="encounter-tactics-hint"
                onChange={(event) => patch({ tactics: event.target.value })}
              />
              {shown("tactics") !== undefined ? (
                <span
                  id="encounter-tactics-hint"
                  role="alert"
                  className="text-caption leading-body text-danger-ink"
                >
                  {shown("tactics")}
                </span>
              ) : (
                <span
                  id="encounter-tactics-hint"
                  className="text-caption leading-body text-muted-foreground"
                >
                  How you mean to run it, in order. Only you see these.
                </span>
              )}
            </div>

            <Field
              label="Treasure"
              htmlFor="encounter-treasure"
              hint="What the party can come away with. Only you see it."
              error={shown("treasure")}
            >
              <Input
                id="encounter-treasure"
                maxLength={ENCOUNTER_TREASURE_MAX}
                placeholder="Coin, items, clues"
                value={draft.treasure}
                onChange={(event) => patch({ treasure: event.target.value })}
              />
            </Field>
          </BuilderCard>
        </div>
      </div>

      {blocker.status === "blocked" && (
        <Dialog open onOpenChange={(open) => !open && blocker.reset()}>
          <DialogContent aria-label="Leave without saving">
            <DialogHeader>
              <DialogTitle>Leave without saving?</DialogTitle>
              <DialogDescription>
                What you changed here has not been saved, and leaving throws it away.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={blocker.reset}>
                Keep editing
              </Button>
              <Button variant="destructive" size="sm" onClick={blocker.proceed}>
                Discard changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/**
 * The encounter's other read-aloud notes, as they read: the box above edits
 * only the oldest, and these are edited where they live, in Notes.
 */
function OtherReadAloud({
  campaignId,
  notes,
}: {
  readonly campaignId: CampaignId;
  readonly notes: ReadonlyArray<Note>;
}) {
  return (
    <section aria-labelledby="other-read-aloud" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span id="other-read-aloud" className="text-label leading-snug font-medium text-heading">
          {notes.length === 1 ? "Also read aloud" : `Also read aloud (${String(notes.length)})`}
        </span>
        <Link
          to="/campaigns/$campaignId/notes"
          params={{ campaignId }}
          className="text-caption leading-snug text-link hover:text-link-hover"
        >
          Edit in Notes
        </Link>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {notes.map((note) => (
          <li
            key={note.id}
            className="rounded-md border border-hairline bg-surface-sunken px-4 py-3"
          >
            <div className="text-label-s leading-snug font-medium text-muted-foreground">
              {note.title}
            </div>
            <p className="mt-1.5 mb-0 font-serif text-body-s leading-body whitespace-pre-line text-foreground italic">
              {note.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The *Battle map* card: the picture Hob drew of the place, whole, over the
 * setting line it was drawn from.
 *
 * **Hob's picture, never an upload.** The drawing's card is a drop target;
 * a map is drawn once, from the setting line, as the encounter is made, with no
 * redraw and no upload, so the card shows what Hob drew. A new encounter has
 * nothing drawn yet and an old one may have no picture at all (images off,
 * nothing to draw from, a refused or failed draw); either way the card is the
 * setting line alone, with no empty slot. While Hob is still drawing it says
 * so, and re-reads the map until the picture lands.
 *
 * The picture is the encounter page's read (`encounterPageAtom`), the one the
 * preview and the page already hold, so arriving from either costs no request.
 */
function BattleMapCard({
  campaignId,
  encounterId,
  children,
}: {
  readonly campaignId: CampaignId;
  readonly encounterId: EncounterId | undefined;
  /** The setting line's field. */
  readonly children: ReactNode;
}) {
  return (
    <Card role="region" aria-labelledby="battle-map-heading" className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-hairline px-5 py-4">
        <SectionHeading id="battle-map-heading" size="title">
          Battle map
        </SectionHeading>
        <span className="text-body-s leading-snug text-muted-foreground">
          A grid goes over it when you run the encounter.
        </span>
      </div>
      {encounterId !== undefined && <DrawnMap campaignId={campaignId} encounterId={encounterId} />}
      <div className="p-5">{children}</div>
    </Card>
  );
}

/** The picture itself, or Hob drawing it, or nothing. */
function DrawnMap({
  campaignId,
  encounterId,
}: {
  readonly campaignId: CampaignId;
  readonly encounterId: EncounterId;
}) {
  const [page] = useApiAtom(encounterPageAtom({ campaignId, encounterId }));
  const map = page.state === "ready" ? page.value.map : null;
  const invalidate = useInvalidate();
  const rereadMap = useCallback(
    () => invalidate([reads.battleMap(encounterId)]),
    [invalidate, encounterId],
  );
  useHobDrawingPolling(map?.imagePending ?? false, rereadMap);
  // The builder has already read the map for its setting line, so a failure
  // here is a second read's; the form still works without the picture.
  return map === null ? null : (
    <HobCover image={map.image} pending={map.imagePending} shape="whole" />
  );
}

/** One of the builder's cards: a heading when it has one, then its fields. */
function BuilderCard({
  title,
  className,
  children,
}: {
  readonly title?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const headingId =
    title === undefined ? undefined : `builder-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <Card
      {...(headingId !== undefined && { role: "region", "aria-labelledby": headingId })}
      className={`min-w-0 gap-4.5 p-5 ${className ?? ""}`}
    >
      {title !== undefined && (
        <SectionHeading id={headingId} size="title">
          {title}
        </SectionHeading>
      )}
      {children}
    </Card>
  );
}

/**
 * One line of the roster, as drawn: the creature, its numbers, a stepper, the
 * line's XP and a remove. Stepping below one removes the line.
 *
 * **It wraps rather than squeezing.** The drawing's row gave the name 21px at
 * 390, "G…" over a column of one word per line; here the stepper, the XP and the
 * remove drop under the name once the row cannot hold both, so the name keeps
 * the row's width.
 */
function RosterRow({
  line,
  onStep,
  onRemove,
}: {
  readonly line: RosterLine;
  readonly onStep: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  return (
    <li
      data-slot="roster-line"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline py-2 pr-3 pl-5 first:border-t-0"
    >
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <Icon name="skull" size={15} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div
            data-slot="roster-name"
            className="text-body-s leading-snug font-semibold [overflow-wrap:anywhere] text-heading"
          >
            {line.name}
          </div>
          <div
            data-slot="roster-meta"
            className="mt-0.5 font-mono text-caption leading-snug font-medium whitespace-nowrap text-muted-foreground"
          >
            CR {line.cr} · AC {line.ac} · {line.hp} hp
          </div>
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-0.5 rounded-control border border-strong bg-surface-sunken">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`One fewer ${line.name}`}
            onClick={() => onStep(-1)}
          >
            <Icon name="minus" size={14} />
          </Button>
          <output
            aria-label={`How many ${line.name}`}
            className="min-w-6 text-center font-mono text-mono leading-none font-medium text-heading"
          >
            {line.count}
          </output>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`One more ${line.name}`}
            onClick={() => onStep(1)}
          >
            <Icon name="plus" size={14} />
          </Button>
        </div>
        <span className="w-16 text-right font-mono text-mono leading-none font-medium whitespace-nowrap text-muted-foreground">
          {line.xp === null ? "No XP" : `${(line.xp * line.count).toLocaleString("en")} xp`}
        </span>
        <Button variant="ghost" size="icon" aria-label={`Remove ${line.name}`} onClick={onRemove}>
          <Icon name="x" size={14} />
        </Button>
      </div>
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
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
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
