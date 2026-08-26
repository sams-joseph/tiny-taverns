import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Button, Card, CardContent, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { AppShell, TopBar } from "../shell/AppShell";
import { Field, SaveFailure, Textarea } from "../ui/form";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import {
  emptyDraft,
  MAX_AC,
  MAX_HP,
  MAX_LEVEL,
  payloadFrom,
  problemsIn,
  refused,
  type CharacterDraft as FormDraft,
} from "./create";
import { DraftAside } from "./DraftAside";
import { DraftCard } from "./DraftCard";
import { STARTERS, useCharacterDraft } from "./draft";
import { myCharactersAtom } from "./load";
import { characterWritesAt, createOwnCharacter } from "./write";

/**
 * A player writing down a character of their own —
 * `#/play/campaigns/:campaignId/characters/new`, and **the first screen in the
 * product on which a non-DM creates anything.**
 *
 * Until `POST /me/campaigns/:c/characters` shipped there was no such thing: a
 * player waited for their DM to type one up in `campaign/CharacterDialog.tsx`
 * and hand it over. `MyCharactersScreen`'s own header recorded that as the
 * reason it had no create control, and half of the reason went when
 * `ownRowWritable` landed.
 *
 * ### The table is step one, and that is the captain's decision
 *
 * The drawing (`ui_kits/dm-screen/CharacterCreate.jsx`) puts *Find a table*
 * third, after describing the character and correcting a draft. It is
 * **reordered to first**, by the captain's decision of 2026-08-26, and the
 * reason is in the schema rather than in taste: `character.campaign_id` is
 * `not null` and so is `assistant_thread.campaign_id`, so neither the character
 * nor the conversation that would draft one has anywhere to live before a table
 * is picked. Every alternative is a migration plus a new reach rule in the one
 * model that has none — `0015` is what that cost for `creature`, and it bought a
 * state this product has already recorded as deliberately absent.
 *
 * The drawing also contradicts itself about it: its own showcase line has Hob
 * explaining a subclass by *"your DM's campaign is on the salt road and half of
 * it is marsh"*, which is not producible two steps before the campaign is
 * known. Campaign-first is what makes the design's own intent true.
 *
 * **So the campaign is the route's, and this screen has no picker.** Choosing
 * happens on the way in — `MyCharactersScreen`'s *New character*, which folds
 * the memberships this screen also reads, or `PlayerCampaignScreen`, which is
 * already at one table. A picker here would be a second answer to a question
 * the URL has already settled, and it would let a reader change the answer
 * without the URL saying so.
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
 * - **The abilities and the skills.** Six cells of three fields and a four-of-N
 *   picker are their own controls, they belong to the sheet rather than to a
 *   creation screen — both surfaces get them that way, and a shipped gap closes
 *   as a side effect — and they are not this change's.
 * - **Inline `DraftField` editing.** A third editing idiom in a product with
 *   two, and the least accessible of the three. The shipped dialogs on the sheet
 *   already satisfy *"every field is editable"*, which is what the drawing's own
 *   comment asks for.
 * - **A portrait upload.** The kit wires it to a toast reading *"Not wired in
 *   this kit"*; there is no asset store, and the sheet screen draws initials.
 * - ***Fen approves characters before they play.*** A switch with nothing behind
 *   it, which the delivery's own open questions already say.
 *
 * ### The three things it cannot say, and does not
 *
 * `visibility`, `hpCurrent` and who owns it are not fields on
 * `CharacterOwnCreate`, so there is no control for any of them and one would not
 * compile. The row comes out `dm` — read by its author and by their DM and by
 * nobody else at the table — with hit points at *nobody has said yet*. The form
 * says which of those matters out loud, because a player pressing *Create* is
 * entitled to know who is about to be able to read it.
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
  const { campaignId } = useParams({ from: "/play/campaigns/$campaignId/characters/new" });
  const navigate = useNavigate();
  const [resource, reload] = useApiAtom(myCharactersAtom);
  const view = resource.state === "ready" ? resource.value : undefined;

  const [draft, setDraft] = useState<FormDraft>(emptyDraft);
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const problems = problemsIn(draft);
  const set = <K extends keyof FormDraft>(key: K, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  /**
   * The membership rather than the campaign, because `role` is the half that
   * decides whether this screen is the right door — and it is already read.
   *
   * Two refusals rather than one, and they are different sentences because they
   * are different situations. **Not a member** is the one the server would give
   * too, and there is nothing to do about it here. **A member as the DM** is a
   * table you can reach and still the wrong door: `ensureCampaignReadable`
   * would let you through — `isDm` is a disjunct of `campaignReadable`, and the
   * server documents that as harmless — but the pill is a *mode*, and the way
   * to write a character at a table you run is `campaign/CharacterDialog.tsx`.
   *
   * It matters that this agrees with `tablesForNewCharacter`, which is what the
   * picker folds: a screen that drew a form the picker would never have offered
   * would be a second answer to the same question, reachable by typing a URL.
   */
  const membership = view?.memberships.find((row) => row.campaign.id === campaignId);
  const writable = membership !== undefined && membership.role === "player";

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
    // The same two reads the form's own create names, and for the same reason:
    // the row appears on the DM's party list, which this write has never seen.
    invalidate(characterWritesAt(campaignId));
    await navigate({
      to: "/play/characters/$characterId",
      params: { characterId: made.success.id },
      replace: true,
    });
  };

  const create = async () => {
    setShowProblems(true);
    if (refused(problems)) return;

    const made = await submit(
      (client) => createOwnCharacter(client, campaignId, payloadFrom(draft)),
      // What moved that this write never sent: the roster it will appear on, and
      // the campaign's party list — a DM's screen, which this write has never
      // seen and reaches by naming the resource rather than the screen.
      characterWritesAt(campaignId),
    );

    if (Result.isSuccess(made)) {
      await navigate({
        to: "/play/characters/$characterId",
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
          subtitle={writable ? `Who you are playing at ${membership.campaign.name}.` : undefined}
        >
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link to="/play/characters" />}
          >
            Cancel
          </Button>
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Reading your tables…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined &&
        (!writable ? (
          membership === undefined ? (
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
          ) : (
            <EmptyState icon="crown" title="You run this table">
              A character of your own belongs at a table you play at. The people at this one are on
              your party screen, and that is where you write them down.
            </EmptyState>
          )
        ) : stage === "describe" ? (
          hob.draft !== undefined ? (
            /* **The drawn step 2**, and the aside beside it — the sheet as Hob
               wrote it, why, and the composer that asks for something else.
               `@3xl` on the container rather than a viewport breakpoint,
               because the question is how wide this column is and the Hob panel
               can take 400px out of it without the window moving. */
            <div className="flex flex-col gap-gutter @3xl:flex-row @3xl:items-start">
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
                  onAsk={(text) => hob.ask(text)}
                />
              </div>
            </div>
          ) : (
            /* **The drawn step 1**, minus its campaign question — the URL has
               already settled that, by the captain's decision of 2026-08-26. */
            <div className="flex max-w-measure flex-col gap-7">
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
              {hob.said !== "" && hob.draft === undefined && !hob.thinking && (
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
          <div className="flex max-w-measure flex-col gap-7">
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
                  <Field label="Species" htmlFor="new-character-species">
                    <Input
                      id="new-character-species"
                      placeholder="Wood elf"
                      value={draft.species}
                      onChange={(event) => set("species", event.target.value)}
                      className="w-40"
                    />
                  </Field>
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
                    <Input
                      id="new-character-class"
                      placeholder="Druid"
                      value={draft.className}
                      onChange={(event) => set("className", event.target.value)}
                      className="w-40"
                    />
                  </Field>
                </div>

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
                      onChange={(event) => set("ac", event.target.value)}
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
                      onChange={(event) => set("hpMax", event.target.value)}
                      className="w-28"
                    />
                  </Field>
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

            {/* Said before the press rather than discovered after it. A new
                character is `dm` by column default — its author reads it because
                they own it, its DM because `isDm` is the other disjunct — and
                that is the whole answer to "who can see this", which a player
                has no control on this screen to change. */}
            <p className="flex items-start gap-2 text-caption leading-body text-muted-foreground">
              <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-faint" />
              <span>
                Only you and your DM can see them. Whether the rest of the table can is your
                DM&rsquo;s to decide.
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
          </div>
        ))}
    </AppShell>
  );
}
