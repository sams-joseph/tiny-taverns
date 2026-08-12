import type { CampaignId, Character, CharacterSheet, Visibility } from "@taverns/api";
import { emptyCharacterSheet } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, Textarea, VisibilityField } from "../ui/form";

/**
 * Writing down who is at the table.
 *
 * The form is the `character` row, and since `0012_character_sheet.ts` that row
 * is shaped like a creature: **a field earns a control when it is a column, and
 * everything else goes into the sheet.** So there is a box for the level, the
 * species and the class — the three the captain settled on, because players
 * edit their own characters and levelling is the main thing they will do — and
 * one free area for whatever the table actually keeps about them.
 *
 * ### There is no descriptor field, and there is no preview of one either
 *
 * The `"Level 3 Half-orc Paladin"` half-line `PartyList` renders is **derived**
 * — a generated column over those three, so that a label and the fields it
 * summarises cannot come to disagree. Neither payload has the field, and this
 * form deliberately does not compute it locally to show the DM what it will
 * say: a second implementation of the derivation is exactly the thing the
 * decision exists to prevent, and it would be the copy that drifts. The line
 * appears on the row the moment the save lands.
 *
 * ### The sheet is a document, and this writes one field of it
 *
 * `sheet.notes` is the prose; `abilities` and `traits` are the same shapes a
 * stat block uses and no screen has been drawn for typing them yet. So the save
 * sends the **whole document** with `notes` replaced, which is what keeps a
 * sheet imported or typed elsewhere from being erased by an edit here.
 *
 * ### The numbers are optional, and blank is not zero
 *
 * `level`, `ac` and `hpMax` are nullable, and a character the DM has not looked
 * up yet genuinely has none. Blank sends nothing on create and `null` on update
 * — `PartyList` renders each stat only when it is there, so an unfilled AC is
 * an absent stat rather than an `AC 0` nobody believes.
 */

/** All three match `Character.ts`'s own checks, so the sentence beats the schema to it. */
const MAX_AC = 40;
const MAX_HP = 10_000;
const MAX_LEVEL = 100;

/** `""` ⇄ absent. A blank number field is "I have not filled this in". */
const parseOptional = (raw: string): number | null | undefined =>
  raw.trim() === "" ? null : Number.isInteger(Number(raw)) ? Number(raw) : undefined;

/** The same rule the schema applies, said in a sentence first. */
const isWebUrl = (raw: string): boolean => /^https?:\/\//i.test(raw);

export function CharacterDialog({
  campaignId,
  character,
  onClose,
  onSaved,
}: {
  readonly campaignId: CampaignId;
  /** Absent for a new one. Present, and this edits it. */
  readonly character: Character | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [name, setName] = useState(character?.name ?? "");
  const [playerName, setPlayerName] = useState(character?.playerName ?? "");
  const [levelText, setLevelText] = useState(
    character?.level === null ? "" : String(character?.level ?? ""),
  );
  const [species, setSpecies] = useState(character?.species ?? "");
  const [className, setClassName] = useState(character?.className ?? "");
  const [acText, setAcText] = useState(character?.ac === null ? "" : String(character?.ac ?? ""));
  const [hpText, setHpText] = useState(
    character?.hpMax === null ? "" : String(character?.hpMax ?? ""),
  );
  const [sheetUrl, setSheetUrl] = useState(character?.sheetUrl ?? "");
  const [notes, setNotes] = useState(character?.sheet.notes ?? "");
  // `dm` for a new character: the column default, and the only safe one to fail
  // to. Sharing the party is the campaign's own switch plus this one, in that
  // order — `campaign.visibility` is the gate this narrows within.
  const [visibility, setVisibility] = useState<Visibility>(character?.visibility ?? "dm");
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const level = parseOptional(levelText);
  const ac = parseOptional(acText);
  const hpMax = parseOptional(hpText);

  /**
   * What the DM is told before anything is sent.
   *
   * The contract catches all of it on its own — the derived client encodes
   * through the same schema the handler decodes with, so a bad payload fails
   * locally and never reaches the network. But `Expected a value between 0 and
   * 40 at ["ac"]` is a sentence for whoever wrote the schema. `SaveFailure` is
   * the backstop if one of these is ever missed.
   */
  const problems: { name?: string; level?: string; ac?: string; hpMax?: string; url?: string } = {};
  if (name.trim() === "") problems.name = "Give them a name.";
  if (level === undefined) problems.level = "A level is a whole number.";
  else if (level !== null && (level < 1 || level > MAX_LEVEL)) {
    problems.level = `Between 1 and ${String(MAX_LEVEL)}.`;
  }
  if (ac === undefined) problems.ac = "An armour class is a whole number.";
  else if (ac !== null && (ac < 0 || ac > MAX_AC)) problems.ac = `Between 0 and ${MAX_AC}.`;
  if (hpMax === undefined) problems.hpMax = "Hit points are a whole number.";
  else if (hpMax !== null && (hpMax < 0 || hpMax > MAX_HP)) {
    problems.hpMax = `Between 0 and ${MAX_HP.toLocaleString("en")}.`;
  }
  if (sheetUrl.trim() !== "" && !isWebUrl(sheetUrl.trim())) {
    // The schema refuses anything else, and this is why: the link is rendered
    // as an `href`, and a `javascript:` URL in one is how a text column becomes
    // an exploit.
    problems.url = "A link starting http:// or https://.";
  }
  const refused = Object.keys(problems).length > 0;

  const save = async () => {
    setShowProblems(true);
    if (refused) return;

    const trimmedPlayer = playerName.trim();
    const trimmedSpecies = species.trim();
    const trimmedClass = className.trim();
    const trimmedUrl = sheetUrl.trim();
    // The whole document, with the one field this form writes replaced. The
    // rest is what the character already had — a form that sent only `notes`
    // would delete every ability and feature it was never shown.
    const base: CharacterSheet = character?.sheet ?? emptyCharacterSheet;
    const sheet: CharacterSheet = { ...base, notes: notes.trim() };

    const saved = await submit((client) =>
      character === undefined
        ? // `CharacterCreate`'s optional fields take no null: a character with
          // no player named simply does not say so, exactly as an unrated
          // encounter omits its difficulty rather than sending one.
          client.characters.create({
            params: { campaignId },
            payload: {
              name: name.trim(),
              ...(trimmedPlayer === "" ? {} : { playerName: trimmedPlayer }),
              ...(level === null ? {} : { level }),
              ...(trimmedSpecies === "" ? {} : { species: trimmedSpecies }),
              ...(trimmedClass === "" ? {} : { className: trimmedClass }),
              ...(ac === null ? {} : { ac }),
              ...(hpMax === null ? {} : { hpMax }),
              ...(trimmedUrl === "" ? {} : { sheetUrl: trimmedUrl }),
              ...(sheet.notes === "" ? {} : { sheet }),
              visibility,
            },
          })
        : // On update every one of them is nullable, and a cleared field is a
          // null rather than an omission — omitting it would leave the old
          // value, which is not what emptying a box means.
          client.characters.update({
            params: { campaignId, characterId: character.id },
            payload: {
              name: name.trim(),
              playerName: trimmedPlayer === "" ? null : trimmedPlayer,
              level,
              species: trimmedSpecies === "" ? null : trimmedSpecies,
              className: trimmedClass === "" ? null : trimmedClass,
              ac,
              hpMax,
              sheetUrl: trimmedUrl === "" ? null : trimmedUrl,
              sheet,
              visibility,
            },
          }),
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  const isNew = character === undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={isNew ? "Add a character" : "Edit character"}>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a character" : "Edit character"}</DialogTitle>
          <DialogDescription>
            One of the people your players are running. The fight seeds its initiative list from
            these.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field
            label="Character"
            htmlFor="character-name"
            error={showProblems ? problems.name : undefined}
          >
            <Input
              id="character-name"
              placeholder="Brannoc"
              value={name}
              aria-invalid={showProblems && problems.name !== undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field
            label="Player"
            htmlFor="character-player"
            hint="Whoever is running them. Blank is fine — an NPC the party travels with has none."
          >
            <Input
              id="character-player"
              placeholder="Ilse"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap gap-5">
            <Field
              label="Level"
              htmlFor="character-level"
              error={showProblems ? problems.level : undefined}
            >
              <Input
                id="character-level"
                mono
                type="number"
                min={1}
                max={MAX_LEVEL}
                value={levelText}
                aria-invalid={showProblems && problems.level !== undefined}
                onChange={(event) => setLevelText(event.target.value)}
                className="w-20"
              />
            </Field>
            <Field label="Species" htmlFor="character-species">
              <Input
                id="character-species"
                placeholder="Half-orc"
                value={species}
                onChange={(event) => setSpecies(event.target.value)}
                className="w-40"
              />
            </Field>
            <Field
              label="Class"
              htmlFor="character-class"
              hint="Three fields, not one line — the half-line under their name is written from them."
            >
              <Input
                id="character-class"
                placeholder="Paladin"
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                className="w-40"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-5">
            <Field label="AC" htmlFor="character-ac" error={showProblems ? problems.ac : undefined}>
              <Input
                id="character-ac"
                mono
                type="number"
                min={0}
                max={MAX_AC}
                value={acText}
                aria-invalid={showProblems && problems.ac !== undefined}
                onChange={(event) => setAcText(event.target.value)}
                className="w-24"
              />
            </Field>
            <Field
              label="Hit points"
              htmlFor="character-hp"
              hint="Their maximum. What they are on tonight belongs to the fight, not to here."
              error={showProblems ? problems.hpMax : undefined}
            >
              <Input
                id="character-hp"
                mono
                type="number"
                min={0}
                max={MAX_HP}
                value={hpText}
                aria-invalid={showProblems && problems.hpMax !== undefined}
                onChange={(event) => setHpText(event.target.value)}
                className="w-28"
              />
            </Field>
          </div>

          <Field
            label="Sheet"
            htmlFor="character-sheet-url"
            hint="Where the real sheet lives, if it lives somewhere else."
            error={showProblems ? problems.url : undefined}
          >
            <Input
              id="character-sheet-url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={sheetUrl}
              aria-invalid={showProblems && problems.url !== undefined}
              onChange={(event) => setSheetUrl(event.target.value)}
            />
          </Field>

          <Field
            label="Notes"
            htmlFor="character-notes"
            hint="Background, appearance, what they are afraid of. Searchable with the rest of the record."
          >
            <Textarea
              id="character-notes"
              placeholder="Owes the ferryman a name and has not decided which one."
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>

          <VisibilityField
            id="character-visibility"
            value={visibility}
            onChange={setVisibility}
            shared="Your players can see this character and their numbers."
            hidden="Only you can see this character."
          />
        </div>

        {/* In the footer, not at the end of the body — see `EncounterDialog`. */}
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
            {busy ? "Saving…" : isNew ? "Add character" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
