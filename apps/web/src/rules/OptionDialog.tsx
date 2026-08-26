import type {
  CampaignId,
  CharacterOption,
  ClassBody,
  OptionKind,
  SpeciesBody,
  Visibility,
} from "@taverns/api";
import { ABILITY_KEYS, type AbilityKey } from "@taverns/api";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@taverns/ui";
import { Effect, Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea, VisibilityField } from "../ui/form";
import { optionWritesAt } from "./load";
import { unarmouredLine } from "./option";

/**
 * Writing a class or a species, and editing the one this table holds.
 *
 * ### It is one dialog and **two different writes**, and the difference is the
 * whole shape of the Library model
 *
 * - **Writing a new one is two statements in one `submit`**: it authors the
 *   original into this account's Library, then copies it into this campaign.
 *   The `EncounterDialog` precedent — one form, one `Effect`, two writes —
 *   because two `submit`s would give the form two busy flags and a half-saved
 *   class to explain. There is no `POST /campaigns/:c/options`: authoring
 *   happens in the Library by the captain's second statement, so the campaign
 *   gets a row through `derive` and through nothing else.
 * - **Editing one edits the campaign's copy and nothing else.** The original
 *   stays exactly as it was, which is what the sentence at the bottom of the
 *   form says out loud — see below.
 *
 * ### The copy is a snapshot, and this dialog is where that is explained
 *
 * `CopyIntoCampaign` makes the same point about a monster, and it is more
 * surprising here: a DM who fixes a hit die on their table's copy will expect
 * their Library to follow, and it does not. Nothing is ever read through
 * `derivedFrom`, so the two rows part company the moment either is edited. It
 * is said in the form rather than left to be discovered at the table.
 *
 * ### `visibility` is a **visible choice**, sent out loud, and defaults on
 *
 * `corpusRowReadable` ends in `isDm OR visibility = 'shared'`, so a class the
 * players cannot see is a class no player can pick — and the create form's two
 * pickers are a player's screen. For a monster that gate is the whole point of
 * the feature; for a rules entry it is friction, and a table's classes are not
 * secrets the way a stat block is.
 *
 * So this is the **one form in the product whose visibility switch starts on**,
 * and it is a screen-level choice rather than a changed column default: the
 * payload says `visibility: "shared"` in as many words, exactly as
 * `CharacterDialog` says `dm` in as many words. Nothing in
 * `repo/visibility.ts` moved, `dm` is still what an unstated visibility means
 * everywhere, and a DM with a class they are not ready to show turns the switch
 * off and it behaves like everything else.
 */

/** What the form holds, before any of it is a payload. */
interface OptionDraft {
  readonly name: string;
  readonly summary: string;
  /** A number of faces: `"10"` for a d10. Class only. */
  readonly hitDie: string;
  /** Which ability modifiers are added to 10 unarmoured. Class only. */
  readonly unarmouredAc: ReadonlyArray<AbilityKey>;
  /** Extra hit points per level. Species only. */
  readonly hpPerLevel: string;
  readonly visibility: Visibility;
}

/** All three match `CharacterOption.ts`'s own checks, so the sentence beats the schema to it. */
const MAX_HIT_DIE = 100;
const MAX_HP_PER_LEVEL = 20;

/**
 * The form's starting state.
 *
 * It takes no `kind` and does not need one: an empty draft carries a plausible
 * default for **both** halves and the form draws only the half its `kind` prop
 * names, and an existing row's `kind` is on the row. That is the union earning
 * its place — there is no state in which the wrong half could be read as the
 * right one, because the row says which it is.
 */
const draftFrom = (option: CharacterOption | undefined): OptionDraft => {
  if (option === undefined) {
    return {
      name: "",
      summary: "",
      hitDie: "8",
      // The ten-of-twelve answer, and the one a homebrew class most often
      // wants. The two exceptions are a press away.
      unarmouredAc: ["DEX"],
      hpPerLevel: "0",
      // **On, and this is the decision** — see the block above.
      visibility: "shared",
    };
  }
  return {
    name: option.name,
    summary: option.body.summary ?? "",
    hitDie: option.kind === "class" ? String(option.body.hitDie) : "8",
    unarmouredAc: option.kind === "class" ? [...option.body.unarmouredAc] : ["DEX"],
    hpPerLevel: option.kind === "species" ? String(option.body.hpPerLevel) : "0",
    visibility: option.visibility,
  };
};

/** `""` ⇄ not a number. A blank die is a form that is not finished. */
const parseWhole = (raw: string): number | undefined =>
  raw.trim() !== "" && Number.isInteger(Number(raw)) ? Number(raw) : undefined;

interface DraftProblems {
  readonly name?: string;
  readonly hitDie?: string;
  readonly hpPerLevel?: string;
}

/**
 * What the DM is told before anything is sent.
 *
 * The contract catches all of it on its own — the derived client encodes
 * through the same schema the handler decodes with, so a bad payload fails
 * locally and never reaches the network. But `Expected a value between 1 and
 * 100 at ["body"]["hitDie"]` is a sentence for whoever wrote the schema, so
 * these come first and `SaveFailure` is the backstop.
 */
const problemsIn = (kind: OptionKind, draft: OptionDraft): DraftProblems => {
  const problems: { name?: string; hitDie?: string; hpPerLevel?: string } = {};
  if (draft.name.trim() === "") problems.name = "Give it a name.";

  if (kind === "class") {
    const die = parseWhole(draft.hitDie);
    if (die === undefined) problems.hitDie = "A hit die is a whole number of faces.";
    else if (die < 1 || die > MAX_HIT_DIE) {
      problems.hitDie = `Between 1 and ${String(MAX_HIT_DIE)}.`;
    }
  } else {
    const hp = parseWhole(draft.hpPerLevel);
    if (hp === undefined) problems.hpPerLevel = "Hit points per level are a whole number.";
    else if (hp < 0 || hp > MAX_HP_PER_LEVEL) {
      problems.hpPerLevel = `Between 0 and ${String(MAX_HP_PER_LEVEL)}.`;
    }
  }
  return problems;
};

const bodyOf = (kind: OptionKind, draft: OptionDraft): ClassBody | SpeciesBody => {
  const summary = draft.summary.trim();
  // Omitted rather than `""`, which is `CharacterOption.ts`'s own rule about an
  // optional key: an empty summary is *nobody wrote one*, and a blank string
  // stored in the document would render as an empty paragraph on the card.
  const shared = summary === "" ? {} : { summary };
  return kind === "class"
    ? { hitDie: parseWhole(draft.hitDie) ?? 8, unarmouredAc: draft.unarmouredAc, ...shared }
    : { hpPerLevel: parseWhole(draft.hpPerLevel) ?? 0, ...shared };
};

export function OptionDialog({
  campaignId,
  kind,
  option,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  /** Which kind is being written. Not editable — see `OptionUpdate`. */
  readonly kind: OptionKind;
  /** The campaign's copy being edited, or `undefined` to write a new one. */
  readonly option: CharacterOption | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [draft, setDraft] = useState<OptionDraft>(() => draftFrom(option));
  const [showProblems, setShowProblems] = useState(false);
  const { busy, failure, submit } = useMutation();

  const problems = problemsIn(kind, draft);
  const set = <K extends keyof OptionDraft>(key: K, value: OptionDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const isNew = option === undefined;
  const noun = kind === "class" ? "class" : "species";

  const toggleAbility = (key: AbilityKey, on: boolean) =>
    set(
      "unarmouredAc",
      on
        ? // In `ABILITY_KEYS` order rather than press order, so `10 + DEX + CON`
          // reads the same however it was clicked. The sum does not care; the
          // person reading the card does.
          ABILITY_KEYS.filter((ability) => ability === key || draft.unarmouredAc.includes(ability))
        : draft.unarmouredAc.filter((ability) => ability !== key),
    );

  const save = async () => {
    setShowProblems(true);
    if (Object.keys(problems).length > 0) return;

    const name = draft.name.trim();
    const body = bodyOf(kind, draft);

    const saved = await submit(
      (client) =>
        Effect.gen(function* () {
          if (option !== undefined) {
            return yield* client.options.update({
              params: { campaignId, optionId: option.id },
              payload: { name, body, visibility: draft.visibility },
            });
          }

          // **Two writes, one `Effect`.** Authoring is a Library act; using it
          // here is a copy. Two separate `submit`s would give this form two busy
          // flags and a half-saved class to explain — a DM who wrote one and
          // then found it was not on their table.
          //
          // There is no transaction across requests, so a failure between the
          // two leaves the original in the Library and the table without it.
          // That is the honest outcome and it is recoverable in one press —
          // *Copy from your library* is the control for exactly that state —
          // where rolling back with a third request would fail the same way one
          // call later.
          // Two calls rather than one with a computed payload: the create is a
          // union discriminated on `kind`, so branching at the call site is
          // what lets the compiler see that a class create carries a class
          // document. A single call with a widened payload would need a cast,
          // and a cast is exactly what a discriminated union exists to avoid.
          const original =
            kind === "class"
              ? yield* client.library.createOption({
                  payload: { kind: "class", name, body: body as ClassBody },
                })
              : yield* client.library.createOption({
                  payload: { kind: "species", name, body: body as SpeciesBody },
                });
          return yield* client.options.derive({
            params: { campaignId, optionId: original.id },
            // The visible screen-level choice, said out loud on the wire. It is
            // the *only* place a copy's visibility is ever named, which is what
            // keeps `dm` the meaning of an unstated one everywhere else.
            payload: { visibility: draft.visibility },
          });
        }),
      // Both lists, always. Authoring touches the Library as well as the
      // campaign, and the copy control's own list would otherwise be one row
      // short until something else refreshed it.
      optionWritesAt(campaignId),
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={isNew ? `Write a ${noun}` : `Edit ${option.name}`}>
        <DialogHeader>
          <DialogTitle>{isNew ? `Write a ${noun}` : `Edit ${option.name}`}</DialogTitle>
          <DialogDescription>
            {kind === "class"
              ? "A class carries the hit die a new character's hit points are worked out from."
              : "A species carries the extra hit points it gives at every level."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field
            label="Name"
            htmlFor="option-name"
            error={showProblems ? problems.name : undefined}
            hint="What a player picks it by, and what lands on their sheet."
          >
            <Input
              id="option-name"
              placeholder={kind === "class" ? "Bloodsworn" : "Marshfolk"}
              value={draft.name}
              aria-invalid={showProblems && problems.name !== undefined}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>

          {kind === "class" ? (
            <>
              <Field
                label="Hit die"
                htmlFor="option-hit-die"
                hint="The number of faces. A level-1 character gets this at its maximum, plus their constitution."
                error={showProblems ? problems.hitDie : undefined}
              >
                <Input
                  id="option-hit-die"
                  mono
                  type="number"
                  min={1}
                  max={MAX_HIT_DIE}
                  value={draft.hitDie}
                  aria-invalid={showProblems && problems.hitDie !== undefined}
                  onChange={(event) => set("hitDie", event.target.value)}
                  className="w-24"
                />
              </Field>

              {/* Six toggles rather than a *has unarmoured defence* switch,
                  because the real ruleset needs two different answers:
                  Barbarian is `10 + DEX + CON` and Monk is `10 + DEX + WIS`.
                  A boolean would be quietly wrong for exactly the two classes
                  most likely to notice, and a homebrew class is more likely to
                  be unusual here rather than less. */}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-label leading-snug font-semibold text-heading">
                  Unarmoured armour class
                </legend>
                <p className="text-caption leading-body text-muted-foreground">
                  Ten plus these, when nothing is worn.{" "}
                  <span className="text-heading">{unarmouredLine(draft.unarmouredAc)}</span>
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                  {ABILITY_KEYS.map((ability) => (
                    <div key={ability} className="flex items-center gap-2">
                      <Checkbox
                        id={`option-ac-${ability}`}
                        checked={draft.unarmouredAc.includes(ability)}
                        onCheckedChange={(next) => toggleAbility(ability, next === true)}
                      />
                      <Label htmlFor={`option-ac-${ability}`}>{ability}</Label>
                    </div>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <Field
              label="Hit points per level"
              htmlFor="option-hp-per-level"
              hint="Nine of the ten in the book give none. A dwarf gives one."
              error={showProblems ? problems.hpPerLevel : undefined}
            >
              <Input
                id="option-hp-per-level"
                mono
                type="number"
                min={0}
                max={MAX_HP_PER_LEVEL}
                value={draft.hpPerLevel}
                aria-invalid={showProblems && problems.hpPerLevel !== undefined}
                onChange={(event) => set("hpPerLevel", event.target.value)}
                className="w-24"
              />
            </Field>
          )}

          <Field
            label="What it is"
            htmlFor="option-summary"
            hint="One line, for whoever is picking. Blank is fine."
          >
            <Textarea
              id="option-summary"
              placeholder="Sworn to the marsh, and it takes its due in blood."
              value={draft.summary}
              onChange={(event) => set("summary", event.target.value)}
            />
          </Field>

          <VisibilityField
            id="option-visibility"
            value={draft.visibility}
            onChange={(next) => set("visibility", next)}
            shared={`Your players can pick this ${noun} when they make a character.`}
            hidden={`Only you can see it. No player can pick this ${noun} until you share it.`}
          />

          {/* The snapshot, said where it will be believed. `CopyIntoCampaign`
              makes the same point about a monster; here it is the likeliest
              support question the whole feature creates. */}
          <p className="text-caption leading-body text-muted-foreground">
            {isNew
              ? `This writes the ${noun} into your library and copies it into this campaign. The campaign's copy is a snapshot — editing it here later will not change your library's original, and editing the original will not change this table.`
              : `You are editing this campaign's copy. Your library's original is untouched, and so is every character already made from this ${noun} — they keep the numbers they were made with.`}
          </p>
        </div>

        {/* In the footer, not at the end of the body — the body scrolls. */}
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
            {busy ? "Saving…" : isNew ? `Add ${noun}` : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
