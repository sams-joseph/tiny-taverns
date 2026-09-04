import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Icon,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { AppShell, TopBar } from "../shell/AppShell";
import { Field, SaveFailure, Textarea } from "../ui/form";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { abilitySummary, type AbilityDraft } from "./abilities";
import { AbilityScoresDialog } from "./AbilitiesDialog";
import {
  emptyDraft,
  kitOf,
  kitRowsIn,
  MAX_AC,
  MAX_HP,
  MAX_LEVEL,
  payloadFrom,
  pickKitRow,
  pickKitSide,
  problemsIn,
  raceChoiceNote,
  raceIn,
  refused,
  seededDraft,
  selectedRaceBonuses,
  subraceOptionsOf,
  withKitDefaults,
  type CharacterDraft as FormDraft,
  type SeededField,
} from "./create";
import { DraftAside } from "./DraftAside";
import { DraftCard } from "./DraftCard";
import { ABILITY_KEYS, type AbilityKey, type EquipmentId } from "@taverns/api";
import { STARTERS, useCharacterDraft } from "./draft";
import { newCharacterAtom } from "./load";
import { characterCreateWrites, createOwnCharacter } from "./write";

/**
 * A player writing down a character of their own —
 * `#/campaigns/:campaignId/characters/new`, and **the first screen in the
 * product on which a non-DM creates anything.**
 *
 * Until `POST /me/campaigns/:c/characters` shipped there was no such thing: a
 * player waited for their DM to type one up in `campaign/CharacterDialog.tsx`
 * and hand it over. `MyCharactersScreen`'s own header recorded that as the
 * reason it had no create control, and half of the reason went when
 * `ownRowWritable` landed.
 *
 * ### The campaign context is step one, and that is still the route
 *
 * The drawing (`ui_kits/dm-screen/CharacterCreate.jsx`) puts *Find a table*
 * third, after describing the character and correcting a draft. It is
 * **reordered to first**, by the captain's decision of 2026-08-26. Creation no
 * longer seats the character there: the campaign now supplies the form's
 * vocabulary and the campaign-scoped Hob thread only. Seating is the later
 * explicit *Add to campaign* / `party.join` act.
 *
 * The drawing also contradicts itself about it: its own showcase line has Hob
 * explaining a subclass by *"your DM's campaign is on the salt road and half of
 * it is marsh"*, which is not producible two steps before the campaign is
 * known. Campaign-first is what makes the design's own intent true.
 *
 * **So the campaign context is the route's, and this screen has no picker.**
 * Choosing happens on the way in — `MyCharactersScreen`'s *New character*,
 * which folds the memberships this screen also reads, or a campaign page that
 * already has one context. A picker here would be a second answer to a
 * question the URL has already settled, and it would let a reader change the
 * vocabulary/Hob context without the URL saying so.
 *
 * ### What is deliberately not on it
 *
 * Everything the drawing's step 2 has that this does not, each reported rather
 * than stubbed:
 *
 * - **The prose composer, the starter chips, *Have Hob draft the sheet*, the
 *   *What Hob did* aside and the redraft loop.** There is no Hob here at all —
 *   this is the spine the drawing itself calls *Fill it in myself*
 *   (`CharacterCreate.jsx:128`), and it lands on the same place the drafted
 *   path will.
 * - **The skills.** A four-of-N picker is its own control and belongs to the
 *   sheet; the counter it would need is a level-1 rule that stops being true at
 *   level 3, which is the call `SkillsDialog` already made.
 * - **Inline `DraftField` editing.** A third editing idiom in a product with
 *   two, and the least accessible of the three. The shipped dialogs on the sheet
 *   already satisfy *"every field is editable"*, which is what the drawing's own
 *   comment asks for.
 * - **A portrait upload.** The kit wires it to a toast reading *"Not wired in
 *   this kit"*; there is no asset store, and the sheet screen draws initials.
 * - ***Fen approves characters before they play.*** A switch with nothing behind
 *   it, which the delivery's own open questions already say.
 *
 * The **abilities** were on that list and are not any more. They came back
 * because the seed reads two of the six: a hand-filled Dwarf Barbarian was
 * coming out on 13 hit points and armour class 10 where Hob's draft of the same
 * character came out on 15 and 13, and the difference was entirely that only one
 * of the two paths had scores to seed from. They are the shipped editor —
 * `AbilityFields`, behind `AbilityScoresDialog` — rather than a second one, so
 * there is still one answer to what the six cells are.
 *
 * ### The three things it cannot say, and does not
 *
 * `visibility`, `hpCurrent` and who owns it are not fields on
 * `CharacterOwnCreate`, so there is no control for any of them and one would not
 * compile. The row comes out unseated, read by its owner and by nobody through
 * a campaign, with hit points at *nobody has said yet*. The form says that out
 * loud, because a player pressing *Create* is entitled to know it is not being
 * placed on a party roster yet.
 */

/**
 * Where a finished character goes: **the shipped sheet, on a row that now
 * exists.**
 *
 * There is no second editor, which is the single biggest simplification
 * campaign-first bought. The sheet's three dialogs and its death saves all go
 * through `saveOwnCharacter` and take a `Character`, so they work here unchanged
 * the moment the row is real — where a wizard holding a client-side draft would
 * have had to refactor all three from `(character, endpoint)` to
 * `(value, onSave)`, or grow a fourth copy of each.
 *
 * `replace: true`, so *Back* from the sheet goes to wherever the player started
 * rather than to a form for a character they have already made.
 */
export function CharacterCreateScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId/characters/new" });
  const navigate = useNavigate();
  const [resource, reload] = useApiAtom(newCharacterAtom(campaignId));
  const view = resource.state === "ready" ? resource.value : undefined;

  const [draft, setDraft] = useState<FormDraft>(emptyDraft);
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  /**
   * Which of the two seeded boxes the player has typed in.
   *
   * Held here rather than in `create.ts` because it is form state in the sense
   * `api/mutation.ts` means — it belongs to one open form and must not outlive
   * it. What it buys is that picking a class re-seeds while a typed number is
   * never overwritten; see `seededDraft`, which is where the rule is written.
   */
  const [edited, setEdited] = useState<ReadonlySet<SeededField>>(() => new Set());

  /** Whether the shipped abilities editor is open over the form. */
  const [scoring, setScoring] = useState(false);

  const problems = problemsIn(draft);
  /** `"STR 15 · DEX 14 · …"`, or nothing at all when nobody has typed one. */
  const scores = abilitySummary(draft.abilities);
  const set = <K extends keyof FormDraft>(key: K, value: FormDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /** Typing in a seeded box is what takes it out of the seed's reach, permanently. */
  const setSeeded = (key: SeededField, value: string) => {
    setEdited((current) => new Set(current).add(key));
    set(key, value);
  };

  /**
   * A pick re-seeds — **the only thing on this screen that ever writes those two
   * boxes on the player's behalf**, and it happens once per pick rather than on
   * a watcher, which is what makes *seed, never recompute* a property of the
   * wiring rather than of a flag.
   */
  const pick = (key: "race" | "subrace" | "className" | "background", value: string) =>
    setDraft((current) => {
      const next =
        key === "race"
          ? { ...current, race: value, subrace: "", raceBonusChoices: [] }
          : { ...current, [key]: value };
      // A class pick resets the kit to side (a) throughout — the choices are
      // the class's own, and a pick made against another class's list would
      // point at a side that no longer exists.
      return seededDraft(
        key === "className" ? withKitDefaults(next, options) : next,
        edited,
        options,
      );
    });

  const toggleRaceBonus = (ability: AbilityKey, on: boolean) =>
    setDraft((current) => {
      const selected = on
        ? [...current.raceBonusChoices, ability]
        : current.raceBonusChoices.filter((item) => item !== ability);
      return seededDraft({ ...current, raceBonusChoices: selected }, edited, options);
    });

  /**
   * The scores re-seed too, through **the same one call** — because the seed
   * reads two of the six.
   *
   * Constitution reaches the hit points and dexterity the armour class (and, for
   * a barbarian or a monk, a second modifier does too), so a set of scores that
   * did not re-seed would leave the two boxes reading the answer for a character
   * whose scores were all 10 — which is exactly the gap this slice exists to
   * close, one screen further along. A box the player has typed over is still
   * theirs, by the same `edited` set: `seededDraft` is where that rule lives and
   * there is one of it.
   */
  const setAbilities = (abilities: ReadonlyArray<AbilityDraft>) => {
    setDraft((current) => seededDraft({ ...current, abilities }, edited, options));
    setScoring(false);
  };

  /**
   * The membership rather than the campaign, because being at the table at all
   * is the half that decides whether this screen is the right door — and it is
   * already read.
   *
   * **Any membership will do, the creator's included** — the continuity
   * decision of 2026-09-01 made a character account-owned and the creator a
   * player too, so the old second refusal (*"You run this table"*, back when
   * the DM typed characters up in a dialog of their own) is gone with the
   * dialog. The one refusal left is the one the server would give too: not at
   * this table.
   *
   * It matters that this agrees with `tablesForNewCharacter`, which is what the
   * picker folds: a screen that drew a form the picker would never have offered
   * would be a second answer to the same question, reachable by typing a URL.
   */
  const membership = view?.memberships.find((row) => row.campaign.id === campaignId);
  const writable = membership !== undefined;

  /**
   * The classes, races and backgrounds **this table** offers — the three
   * pickers, and the three entries the seed reads.
   *
   * It used to be `Ruleset`'s global starter list. A table can have its own
   * now, so the vocabulary is a read: the shared bundle, the reader's own
   * Library, and whatever has been **shared to this table's group**. The
   * narrowing is the server's, not this screen's — `usableInCampaign` in
   * `repo/visibility.ts` — so a class nobody shared is simply not in this
   * answer and there is no client-side filter that could disagree with it.
   *
   * `[]` while the read is in flight, which is the honest state rather than a
   * fallback: an empty picker says *nothing to pick yet* for the fraction of a
   * second before the list lands, and a hard-coded twelve would say something
   * this table may not offer.
   */
  const options = view?.options ?? [];
  const classes = options.filter((option) => option.kind === "class");
  const races = options.filter((option) => option.kind === "race");
  const backgrounds = options.filter((option) => option.kind === "background");
  /** The picked class's starting kit, for the picker below the three selects. */
  const kit = kitOf(draft, options);
  const selectedRace = raceIn(draft, options);
  const subraces = subraceOptionsOf(selectedRace);
  const raceBonuses = selectedRaceBonuses(draft, options);
  const raceChoice = raceChoiceNote(draft, options);
  const choice = selectedRace?.kind === "race" ? selectedRace.body.abilityBonusChoice : undefined;

  /**
   * Which of the two paths this screen is on.
   *
   * `"describe"` is the drawing's step 1 minus its campaign question, which the
   * URL has already settled; `"form"` is *Fill it in myself*, which is the
   * spine. There is no third: the drawn step 2 is the draft card, drawn over
   * `"describe"` once Hob has offered one, and the drawn step 3 is the shipped
   * sheet on a row that exists.
   *
   * **`"form"` is where a reader ends up whenever Hob does not produce a
   * draft**, and that is the common case rather than the sad one — with all
   * tools offered, the captain's own configured 4B chose the propose tool one
   * time in five. One press, no state lost, and the form is the thing that was
   * always going to work.
   */
  const [stage, setStage] = useState<"describe" | "form">("describe");
  const [prose, setProse] = useState("");
  const [kept, setKept] = useState<string | undefined>(undefined);
  const hob = useCharacterDraft(campaignId, writable);
  const invalidate = useInvalidate();

  const keep = async () => {
    setKept(undefined);
    const made = await hob.keep();
    if (Result.isFailure(made)) {
      setKept(made.failure);
      return;
    }
    // The same read the form's own create names: only the owned-character list
    // changes. The campaign's party does not until the explicit join.
    invalidate(characterCreateWrites);
    await navigate({
      to: "/characters/$characterId",
      params: { characterId: made.success.id },
      replace: true,
    });
  };

  const create = async () => {
    setShowProblems(true);
    if (refused(problems)) return;

    const made = await submit(
      // The vocabulary goes with the draft, because the six cells this sends
      // are the *seed's*: race and subrace bonuses are applied before the
      // armour class in the box beside them is worked out. See `payloadFrom`.
      (client) => createOwnCharacter(client, campaignId, payloadFrom(draft, options)),
      // What moved that this write never sent: the owned-character roster. The
      // campaign's party list is untouched until the explicit join.
      characterCreateWrites,
    );

    if (Result.isSuccess(made)) {
      await navigate({
        to: "/characters/$characterId",
        params: { characterId: made.success.id },
        replace: true,
      });
    }
  };

  return (
    <AppShell
      campaignName={membership?.campaign.name}
      topBar={
        <TopBar
          title="New character"
          subtitle={writable ? `Using ${membership.campaign.name} as rules context.` : undefined}
        >
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link to="/characters" />}
          >
            Cancel
          </Button>
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Reading your tables…" />}
      {resource.state === "failed" && (
        <div className="mx-auto w-full max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined &&
        (!writable ? (
          // The read this screen already makes is what answers it, so the form
          // is never drawn over a table the save would refuse. `GET
          // /me/campaigns` is the live shelf and composes the same membership
          // clause `ensureCampaignReadable` does, so "not in the answer" and
          // "the create would 404" are the same fact rather than two that
          // could disagree.
          <EmptyState icon="eye-off" title="Not your table">
            You are not at this table, or its DM has not shared it yet. A table appears here once
            you have followed the link its DM sent you and they have opened it up.
          </EmptyState>
        ) : stage === "describe" ? (
          hob.draft !== undefined ? (
            /* **The drawn step 2**, and the aside beside it — the sheet as Hob
               wrote it, why, and the composer that asks for something else.
               `@3xl` on the container rather than a viewport breakpoint,
               because the question is how wide this column is and the Hob panel
               can take 400px out of it without the window moving.

               Centred like the other two, but on its own maximum: this state is
               a prose column *plus* an aside, so the width it is centred within
               is composed from the tokens the two halves are actually drawn at
               (`--measure` + `--gutter` + `--aside-w`) rather than restated as a
               number. Below `@3xl` the row stacks and the maximum stops
               mattering — the page padding is the edge. */
            <div className="mx-auto flex w-full max-w-[calc(var(--measure)+var(--gutter)+var(--aside-w))] flex-col gap-gutter @3xl:flex-row @3xl:items-start">
              <div className="min-w-0 flex-1">
                <DraftCard
                  draft={hob.draft}
                  keeping={hob.keeping}
                  onKeep={() => void keep()}
                  onRewrite={() => setStage("describe")}
                />
                {kept !== undefined && (
                  <p role="alert" className="mt-4 text-body-s leading-body text-danger">
                    {kept}
                  </p>
                )}
                {/* **A redraft that produced no card is the same failure as a
                    first question that did**, one position along and much
                    easier to miss: the old sheet is still on screen and would
                    otherwise sit there unchanged with nothing saying why. */}
                {hob.said !== "" && hob.offeredNothing && (
                  <div className="mt-6 flex flex-col gap-2 border-l-2 border-hairline pl-3.5">
                    <p className="text-body-s leading-body whitespace-pre-wrap text-foreground">
                      {hob.said}
                    </p>
                    <p className="text-caption leading-body text-muted-foreground">
                      Nothing changed on the sheet above. Ask again in different words, or keep them
                      as they are and edit the sheet afterwards.
                    </p>
                  </div>
                )}
                {/* Both ways out of a draft, said plainly. *Fill it in myself*
                    is the same button as on the empty state and lands on the
                    same form — a draft the player does not want costs them one
                    press, not the feature. */}
                <p className="mt-6 flex flex-wrap items-center gap-2 text-caption leading-body text-muted-foreground">
                  Not what you meant?
                  <Button variant="ghost" size="sm" onClick={() => setStage("form")}>
                    Fill it in myself
                  </Button>
                </p>
              </div>
              <div className="@3xl:w-aside @3xl:shrink-0">
                <DraftAside
                  rationale={hob.draft.rationale}
                  busy={hob.thinking || hob.keeping}
                  activity={hob.activity}
                  onAsk={(text) => hob.ask(text)}
                />
              </div>
            </div>
          ) : (
            /* **The drawn step 1**, minus its campaign question — the URL has
               already settled that, by the captain's decision of 2026-08-26. */
            <div className="mx-auto flex w-full max-w-measure flex-col gap-7">
              <div className="flex gap-3">
                <Icon name="sparkles" size={18} className="mt-0.5 shrink-0 text-accent-ink" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-m leading-body text-foreground">
                    Who are they? A few sentences is plenty — where they are from, what they are
                    good at, what they will not do.
                  </p>
                  {/* The one decorative line on this screen, in the one place
                      the kit allows it: italic Alegreya at `--text-faint`,
                      under the reply and never on a control. */}
                  <p className="mt-2 font-display text-body-s leading-body italic text-faint">
                    Don&rsquo;t give me a class. I&rsquo;d rather work it out from the person.
                  </p>
                </div>
              </div>

              <Textarea
                aria-label="Describe your character"
                rows={7}
                placeholder="A wood elf who grew up in a river town, apprenticed to a herbalist who turned out to be feeding something in the cellar…"
                value={prose}
                disabled={hob.thinking}
                onChange={(event) => setProse(event.target.value)}
              />

              <div>
                <div className="mb-2.5 text-micro leading-none tracking-caps uppercase text-faint">
                  Or start from one of these
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((starter) => (
                    <Button
                      key={starter}
                      variant="outline"
                      size="sm"
                      disabled={hob.thinking}
                      onClick={() => setProse(`${starter}. `)}
                    >
                      {starter}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  disabled={hob.available !== true || hob.thinking || prose.trim().length < 12}
                  onClick={() => hob.ask(prose)}
                >
                  <Icon name="sparkles" size={13} />
                  {hob.thinking ? "Hob is drafting…" : "Have Hob draft the sheet"}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setStage("form")}>
                  Fill it in myself
                </Button>
              </div>

              {/* The tool step, in words — the only moment Hob's whole claim,
                  that a draft comes out of what the DM has actually shared, is
                  visible on screen. */}
              {hob.activity !== undefined && (
                <p className="text-caption leading-body text-muted-foreground">{hob.activity}</p>
              )}

              {/* **Hob answered and offered nothing**, which is an ordinary
                  outcome and not an error: measured at one propose call in five
                  on a 4B. Whatever it said stands, and the way on is the form
                  it was always an accelerator over. */}
              {hob.said !== "" && hob.offeredNothing && (
                <div className="flex flex-col gap-2 border-l-2 border-hairline pl-3.5">
                  <p className="text-body-s leading-body whitespace-pre-wrap text-foreground">
                    {hob.said}
                  </p>
                  <p className="text-caption leading-body text-muted-foreground">
                    No sheet came back this time. Ask again in different words, or fill it in
                    yourself — you can always change any of it afterwards.
                  </p>
                </div>
              )}

              {hob.unavailable !== undefined && (
                <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
                  <Icon name="sparkles" size={14} className="mt-0.5 shrink-0 text-faint" />
                  <span>{hob.unavailable}</span>
                </p>
              )}
            </div>
          )
        ) : (
          <div className="mx-auto flex w-full max-w-measure flex-col gap-7">
            {/* The way back to Hob, and it is a link rather than a second
                heading: *Fill it in myself* is a fork rather than a step, so
                the only thing to say is that the other fork is still there. It
                keeps whatever was typed on both sides — `prose` and `draft` are
                separate pieces of state, so neither press loses the other. */}
            <p className="flex flex-wrap items-center gap-2 text-caption leading-body text-muted-foreground">
              Filling it in yourself.
              <Button variant="ghost" size="sm" onClick={() => setStage("describe")}>
                <Icon name="chevron-left" size={13} />
                Have Hob draft it instead
              </Button>
            </p>
            <Card>
              <CardContent className="flex flex-col gap-5 pt-card">
                <Field
                  label="Name"
                  htmlFor="new-character-name"
                  error={showProblems ? problems.name : undefined}
                >
                  <Input
                    id="new-character-name"
                    placeholder="Sorrel"
                    value={draft.name}
                    aria-invalid={showProblems && problems.name !== undefined}
                    onChange={(event) => set("name", event.target.value)}
                  />
                </Field>

                <Field
                  label="Player"
                  htmlFor="new-character-player"
                  hint="What your DM should call you on the initiative list. Blank is fine."
                >
                  <Input
                    id="new-character-player"
                    placeholder="Ilse"
                    value={draft.playerName}
                    onChange={(event) => set("playerName", event.target.value)}
                  />
                </Field>

                <div className="flex flex-wrap gap-5">
                  <Field
                    label="Level"
                    htmlFor="new-character-level"
                    error={showProblems ? problems.level : undefined}
                  >
                    <Input
                      id="new-character-level"
                      mono
                      type="number"
                      min={1}
                      max={MAX_LEVEL}
                      value={draft.level}
                      aria-invalid={showProblems && problems.level !== undefined}
                      onChange={(event) => set("level", event.target.value)}
                      className="w-20"
                    />
                  </Field>
                  {/* **Pickers, not boxes**, by the captain's decision of
                      2026-08-26, and **this table's vocabulary** rather than a
                      global one since a campaign could have its own. It is what
                      makes the two numbers under this row possible at all — a
                      class is the only thing that carries a hit die, and
                      "Circle of the Moon Druid" carries none.

                      What is offered is what the server answered, narrowed by
                      `usableInCampaign`: the shared bundle, your own Library,
                      and what is shared to this table's group. A class nobody
                      has shared is not in this list, which is the seam doing
                      its ordinary job.

                      `Select.Value` is written out rather than left to Base UI:
                      with neither `items` nor children it serialises the value,
                      which for the unpicked state is `""` and draws nothing at
                      all where a placeholder belongs. */}
                  <Field
                    label="Race"
                    htmlFor="new-character-race"
                    // The vocabulary is this campaign's, including contained
                    // subraces where the race source supplies them. Both fields
                    // are ordinary free text on the sheet afterwards, so a
                    // table with its own label loses nothing.
                    hint="Pick the race first; subraces appear when the source has them."
                  >
                    <Select
                      value={draft.race}
                      onValueChange={(value) => pick("race", String(value))}
                    >
                      <SelectTrigger id="new-character-race" className="w-40">
                        <SelectValue>
                          {(value) => (value === "" ? "Pick a race" : String(value))}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {races.map((option) => (
                          <SelectItem key={option.id} value={option.name}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {subraces.length > 0 && (
                    <Field
                      label="Subrace"
                      htmlFor="new-character-subrace"
                      hint="Contained by the race you picked."
                    >
                      <Select
                        value={draft.subrace}
                        onValueChange={(value) => pick("subrace", String(value))}
                      >
                        <SelectTrigger id="new-character-subrace" className="w-44">
                          <SelectValue>
                            {(value) => (value === "" ? "Pick a subrace" : String(value))}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {subraces.map((subrace) => (
                            <SelectItem key={subrace.name} value={subrace.name}>
                              {subrace.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <Field
                    label="Class"
                    htmlFor="new-character-class"
                    // The same sentence `CharacterDialog` gives the DM, and the
                    // same reason: `descriptor` is a generated column over these
                    // three, so nothing here computes a preview of the line —
                    // that would be the second implementation the decision
                    // exists to prevent. It appears under the name on the sheet
                    // the moment the save lands.
                    hint="Three fields, not one line — the half-line under their name is written from them."
                  >
                    <Select
                      value={draft.className}
                      onValueChange={(value) => pick("className", String(value))}
                    >
                      <SelectTrigger id="new-character-class" className="w-40">
                        <SelectValue>
                          {(value) => (value === "" ? "Pick a class" : String(value))}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((option) => (
                          <SelectItem key={option.id} value={option.name}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {/* **The third picker, and the one that writes sheet data
                      without moving the two seeded numbers.** In the 2014
                      ruleset the ability score arithmetic belongs to race and
                      subrace; a background carries proficiencies, languages,
                      equipment, gold and feature text.

                      The label lands in `sheet.identity.background` rather than
                      in a column: nothing filters or sorts on it and it is not
                      one of the fields `descriptor` is built from, so it earned
                      no column — `Character.ts` makes the same call about
                      `subclass`. It is still ordinary free text on the sheet
                      afterwards, so a table with a background nobody has
                      written down loses nothing. */}
                  <Field
                    label="Background"
                    htmlFor="new-character-background"
                    hint="Where they come from. Your DM's own backgrounds are in this list."
                  >
                    <Select
                      value={draft.background}
                      onValueChange={(value) => pick("background", String(value))}
                    >
                      <SelectTrigger id="new-character-background" className="w-40">
                        <SelectValue>
                          {(value) => (value === "" ? "Pick a background" : String(value))}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {backgrounds.map((option) => (
                          <SelectItem key={option.id} value={option.name}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {/* **The starting kit, as the source structures it**: the lines
                    every member of the class carries, then one select per
                    *(a)/(b)* choice, and — where a side says *"any martial
                    weapon"* — one select per pick over that category's rows.
                    Side (a) is the default so an untouched form still carries
                    a coherent kit; a category left unpicked lands on the Gear
                    section as a line with no weapon attack behind it, rather
                    than as a weapon nobody chose. Both sides are listed and the
                    pick decides, which is what `sheetGrantsFor` reads. */}
                {kit !== undefined && (kit.fixed.length > 0 || kit.choices.length > 0) && (
                  <fieldset className="flex flex-col gap-2.5">
                    <legend className="text-label leading-snug font-semibold text-heading">
                      Starting kit
                    </legend>
                    {kit.fixed.length > 0 && (
                      <p className="text-caption leading-body text-muted-foreground">
                        Comes with{" "}
                        {kit.fixed
                          .map((line) =>
                            line.quantity > 1
                              ? `${String(line.quantity)} × ${line.name}`
                              : line.name,
                          )
                          .join(", ")}
                        .
                      </p>
                    )}
                    {kit.choices.map((choice, index) => {
                      const taken = draft.kitChoices[index] ?? { option: 0, picks: [] };
                      const side = choice.options[taken.option] ?? choice.options[0];
                      const slots = (side?.lines ?? []).flatMap((line) =>
                        line.category === undefined
                          ? []
                          : Array.from({ length: line.quantity }, (_, at) => ({
                              name:
                                line.quantity > 1 ? `${line.name} (${String(at + 1)})` : line.name,
                              category: line.category!,
                            })),
                      );
                      return (
                        <div
                          key={`${choice.desc}-${String(index)}`}
                          className="flex flex-wrap items-end gap-2.5"
                        >
                          <Field
                            label={`Kit choice ${String(index + 1)}`}
                            htmlFor={`new-character-kit-${String(index)}`}
                            hint={choice.desc}
                          >
                            <Select
                              value={String(taken.option)}
                              onValueChange={(value) =>
                                setDraft((current) => pickKitSide(current, index, Number(value)))
                              }
                            >
                              <SelectTrigger
                                id={`new-character-kit-${String(index)}`}
                                className="w-64"
                              >
                                <SelectValue>
                                  {(value) => choice.options[Number(value)]?.label ?? "Pick one"}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {choice.options.map((option, at) => (
                                  <SelectItem key={option.label} value={String(at)}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          {slots.map((slot, at) => {
                            const rows = kitRowsIn(draft, options, slot.category.index);
                            const picked = taken.picks[at] ?? "";
                            return (
                              <Field
                                key={`${slot.category.index}-${String(at)}`}
                                label={slot.name}
                                htmlFor={`new-character-kit-${String(index)}-${String(at)}`}
                              >
                                <Select
                                  value={picked}
                                  onValueChange={(value) =>
                                    setDraft((current) =>
                                      pickKitRow(
                                        current,
                                        index,
                                        at,
                                        value === "" ? undefined : (String(value) as EquipmentId),
                                      ),
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    id={`new-character-kit-${String(index)}-${String(at)}`}
                                    className="w-48"
                                  >
                                    <SelectValue>
                                      {(value) =>
                                        rows.find((row) => row.id === value)?.name ?? "Pick one"
                                      }
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {rows.map((row) => (
                                      <SelectItem key={row.id} value={row.id}>
                                        {row.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                            );
                          })}
                        </div>
                      );
                    })}
                  </fieldset>
                )}

                {choice !== undefined && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-label leading-snug font-semibold text-heading">
                      Race bonus choices
                    </legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                      {ABILITY_KEYS.map((ability) =>
                        choice.bonuses.some((bonus) => bonus.ability === ability) ? (
                          <div key={ability} className="flex items-center gap-2">
                            <Checkbox
                              id={`new-character-race-bonus-${ability}`}
                              checked={draft.raceBonusChoices.includes(ability)}
                              onCheckedChange={(next) => toggleRaceBonus(ability, next === true)}
                            />
                            <Label htmlFor={`new-character-race-bonus-${ability}`}>{ability}</Label>
                          </div>
                        ) : null,
                      )}
                    </div>
                  </fieldset>
                )}

                {(raceBonuses !== "" || raceChoice !== undefined) && (
                  <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
                    <Icon name="sparkles" size={14} className="mt-0.5 shrink-0 text-faint" />
                    <span>
                      {raceBonuses === ""
                        ? "No race bonuses selected yet."
                        : `Race bonuses: ${raceBonuses}.`}
                      {raceChoice === undefined ? "" : ` ${raceChoice}`}
                    </span>
                  </p>
                )}

                {/* **The six cells, and they sit here because this is where
                    they matter**: the two boxes directly below are worked out
                    from them, so the reading order is the causal one — pick the
                    class, set the scores, watch the numbers follow.

                    A summary and a button rather than six rows inline. The
                    editor is `AbilityFields`, the same one the sheet's Stats tab
                    opens, and the dialog around it here writes nothing: the
                    scores are form state until *Create character* sends them as
                    part of one payload. Six rows of four controls in the middle
                    of this card would bury the two boxes they exist to seed, and
                    the shipped idiom for these six is a dialog anyway. */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => setScoring(true)}>
                      <Icon name="dices" size={13} />
                      {scores === undefined ? "Set ability scores" : "Edit ability scores"}
                    </Button>
                    {scores === undefined ? (
                      <span className="text-caption leading-body text-muted-foreground">
                        Optional. Without them you get the class hit die and a bare 10.
                      </span>
                    ) : (
                      <span className="font-mono text-body-s leading-body text-foreground">
                        {scores}
                      </span>
                    )}
                  </div>
                  {showProblems && problems.abilities !== undefined && (
                    <span role="alert" className="text-caption leading-body text-danger-ink">
                      {problems.abilities}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap gap-5">
                    <Field
                      label="AC"
                      htmlFor="new-character-ac"
                      error={showProblems ? problems.ac : undefined}
                    >
                      <Input
                        id="new-character-ac"
                        mono
                        type="number"
                        min={0}
                        max={MAX_AC}
                        value={draft.ac}
                        aria-invalid={showProblems && problems.ac !== undefined}
                        onChange={(event) => setSeeded("ac", event.target.value)}
                        className="w-24"
                      />
                    </Field>
                    <Field
                      label="Hit points"
                      htmlFor="new-character-hp"
                      // Deliberately the *maximum* and nothing else.
                      // `CharacterOwnCreate` has no `hpCurrent`, so what they are
                      // on tonight is the DM's to say — through the fight, or
                      // through the delta endpoint — and there is no box here to
                      // say it in.
                      hint="Their maximum. What they are on tonight is your DM's to track."
                      error={showProblems ? problems.hpMax : undefined}
                    >
                      <Input
                        id="new-character-hp"
                        mono
                        type="number"
                        min={0}
                        max={MAX_HP}
                        value={draft.hpMax}
                        aria-invalid={showProblems && problems.hpMax !== undefined}
                        onChange={(event) => setSeeded("hpMax", event.target.value)}
                        className="w-28"
                      />
                    </Field>
                  </div>
                  {/* **What the two numbers above actually are**, said where
                      they are rather than left to be assumed.

                      They are filled in from the class, the race or subrace and
                      the ability scores the moment any of those changes, and
                      they are a *starting point*: the armour class is the unarmoured
                      base and nothing worn. Nothing recalculates either of them
                      after the character exists, by the captain's decision, so
                      the honest thing is to say so before the player presses
                      *Create* rather than to let them find out at the table.

                      Two sentences rather than one, because the two states are
                      different facts: with no scores set these are the answer
                      for a character whose abilities nobody has typed, and
                      saying so is what stops *"13 hit points"* reading as this
                      barbarian's real total. */}
                  {(draft.className !== "" || draft.race !== "" || draft.subrace !== "") && (
                    <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
                      <Icon name="sparkles" size={14} className="mt-0.5 shrink-0 text-faint" />
                      <span>
                        A starting point from the class, the race or subrace and your ability scores
                        — the hit die, and <span className="font-mono">10</span> before any armour.
                        {scores === undefined
                          ? " No scores are set, so every modifier counts as +0. Set them above and these follow."
                          : " Type over either; nothing changes them for you once they are created."}
                      </span>
                    </p>
                  )}
                </div>

                <Field
                  label="Sheet"
                  htmlFor="new-character-sheet-url"
                  hint="Where the real sheet lives, if it lives somewhere else."
                  error={showProblems ? problems.sheetUrl : undefined}
                >
                  <Input
                    id="new-character-sheet-url"
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={draft.sheetUrl}
                    aria-invalid={showProblems && problems.sheetUrl !== undefined}
                    onChange={(event) => set("sheetUrl", event.target.value)}
                  />
                </Field>

                <Field
                  label="Who they are"
                  htmlFor="new-character-notes"
                  hint="Where they are from, what they are good at, what they will not do. You can add the rest on the sheet."
                >
                  <Textarea
                    id="new-character-notes"
                    placeholder="A wood elf who grew up in a river town, apprenticed to a herbalist who turned out to be feeding something in the cellar."
                    value={draft.notes}
                    onChange={(event) => set("notes", event.target.value)}
                  />
                </Field>
              </CardContent>
            </Card>

            {/* Said before the press rather than discovered after it. Creation
                writes only the account-owned character. No DM, player or
                campaign roster reads it until the owner adds it to a campaign. */}
            <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
              <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-faint" />
              <span>
                They start on your character list, not on a party roster. Add them to a campaign
                when you are ready.
              </span>
            </p>

            {/* One press, and *Cancel* is the bar's — two controls with one name
                on one screen is the ambiguity the backstory's *Edit* had to be
                labelled out of, and the drawing puts it in the bar anyway. */}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={busy} onClick={() => void create()}>
                {busy ? "Creating…" : "Create character"}
              </Button>
              {failure !== undefined && (
                <div className="min-w-0 flex-1">
                  <SaveFailure failure={failure} />
                </div>
              )}
            </div>

            {/* The sheet's own editor, over a character that does not exist
                yet. It hands drafts back rather than saving, and closing it
                without pressing *Use these scores* changes nothing. */}
            {scoring && (
              <AbilityScoresDialog
                drafts={draft.abilities}
                onClose={() => setScoring(false)}
                onDone={setAbilities}
              />
            )}
          </div>
        ))}
    </AppShell>
  );
}
