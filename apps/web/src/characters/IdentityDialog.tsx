import type { Character } from "@taverns/api";
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
import { Field, SaveFailure } from "../ui/form";
import { saveOwnCharacter } from "./write";

/**
 * A player editing the durable half of their own character.
 *
 * **The columns, and exactly the columns `CharacterOwnUpdate` names** — their
 * name, the player behind them, the three the descriptor derives from, the two
 * numbers that move when they level or find better armour, and where the real
 * sheet lives. It is the same form `campaign/CharacterDialog.tsx` gives the DM
 * minus the two fields that are the DM's to say, and that subtraction is the
 * payload's rather than this file's: there is no visibility switch here because
 * the schema has no field for one, and no owner because `CharacterAssign` is a
 * different endpoint that a player cannot reach.
 *
 * ### What it deliberately cannot say, and why the absence is structural
 *
 * `hpCurrent`, `tempHp` and `conditions` — `0014`'s live trio — have no control
 * here and could not have one: a payload that *can* carry a hit point is one
 * that eventually will, so the schema has no field and the derived client's
 * encoder drops the key before a request leaves the browser. The maximum is a
 * different question and is in: a combatant snapshots it at seed time, so
 * writing it reaches no fight already on the table.
 *
 * ### There is no descriptor field, and no preview of one either
 *
 * `"Level 5 Half-orc Paladin"` is a generated column over the three boxes in
 * the middle row. Computing it locally to show what it will say would be the
 * second implementation the generated column exists to prevent — the same call
 * `CharacterDialog` records. It appears under the name the moment the save
 * lands, which is why every write on this screen re-reads rather than patching
 * what it has.
 */

/** `Character.ts`'s own checks, said as a sentence before the schema says it as a type. */
const MAX_AC = 40;
const MAX_HP = 10_000;
const MAX_LEVEL = 100;

/** `""` ⇄ `null`. A blank number box is *I have not filled this in*, not a zero. */
const parseOptional = (raw: string): number | null | undefined =>
  raw.trim() === "" ? null : Number.isInteger(Number(raw)) ? Number(raw) : undefined;

const isWebUrl = (raw: string): boolean => /^https?:\/\//i.test(raw);

export function IdentityDialog({
  character,
  onClose,
  onSaved,
}: {
  readonly character: Character;
  readonly onClose: () => void;
  /** Re-reads the screen: `descriptor` is derived, so the row comes back changed. */
  readonly onSaved: () => void;
}) {
  const [name, setName] = useState(character.name);
  const [playerName, setPlayerName] = useState(character.playerName ?? "");
  const [levelText, setLevelText] = useState(
    character.level === null ? "" : String(character.level),
  );
  const [species, setSpecies] = useState(character.species ?? "");
  const [className, setClassName] = useState(character.className ?? "");
  const [acText, setAcText] = useState(character.ac === null ? "" : String(character.ac));
  const [hpText, setHpText] = useState(character.hpMax === null ? "" : String(character.hpMax));
  const [sheetUrl, setSheetUrl] = useState(character.sheetUrl ?? "");
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const level = parseOptional(levelText);
  const ac = parseOptional(acText);
  const hpMax = parseOptional(hpText);

  /**
   * What the player is told before anything is sent.
   *
   * The contract catches all of it anyway — the derived client encodes through
   * the schema the handler decodes with, so a bad payload fails locally and
   * never reaches the network — but `Expected a value between 0 and 40 at
   * ["ac"]` is a sentence for whoever wrote the schema. `SaveFailure` is the
   * backstop.
   */
  const problems: { name?: string; level?: string; ac?: string; hpMax?: string; url?: string } = {};
  if (name.trim() === "") problems.name = "Give them a name.";
  if (level === undefined) problems.level = "A level is a whole number.";
  else if (level !== null && (level < 1 || level > MAX_LEVEL)) {
    problems.level = `Between 1 and ${String(MAX_LEVEL)}.`;
  }
  if (ac === undefined) problems.ac = "An armour class is a whole number.";
  else if (ac !== null && (ac < 0 || ac > MAX_AC)) problems.ac = `Between 0 and ${String(MAX_AC)}.`;
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

    const saved = await submit((client) =>
      // Every field is nullable, so a cleared box is a `null` rather than an
      // omission — omitting it would leave the old value, which is not what
      // emptying a box means. `sheet` is absent from this payload entirely: the
      // document is written by the surfaces that draw it, and sending it from
      // here would make a name change carry a stale document over a backstory
      // saved a moment earlier in another tab.
      saveOwnCharacter(client, character, {
        name: name.trim(),
        playerName: trimmedPlayer === "" ? null : trimmedPlayer,
        level,
        species: trimmedSpecies === "" ? null : trimmedSpecies,
        className: trimmedClass === "" ? null : trimmedClass,
        ac,
        hpMax,
        sheetUrl: trimmedUrl === "" ? null : trimmedUrl,
      }),
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Edit your character">
        <DialogHeader>
          <DialogTitle>Edit your character</DialogTitle>
          <DialogDescription>
            The parts that stay the same between games. What you are on tonight belongs to your DM.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field
            label="Character"
            htmlFor="own-name"
            error={showProblems ? problems.name : undefined}
          >
            <Input
              id="own-name"
              placeholder="Brannoc"
              value={name}
              aria-invalid={showProblems && problems.name !== undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field label="Player" htmlFor="own-player" hint="Your name at the table, as they say it.">
            <Input
              id="own-player"
              placeholder="Ilse"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
          </Field>

          <div className="flex flex-wrap gap-5">
            <Field
              label="Level"
              htmlFor="own-level"
              error={showProblems ? problems.level : undefined}
            >
              <Input
                id="own-level"
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
            <Field label="Species" htmlFor="own-species">
              <Input
                id="own-species"
                placeholder="Half-orc"
                value={species}
                onChange={(event) => setSpecies(event.target.value)}
                className="w-40"
              />
            </Field>
            <Field
              label="Class"
              htmlFor="own-class"
              hint="Three fields, not one line — the half-line under your name is written from them."
            >
              <Input
                id="own-class"
                placeholder="Paladin"
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                className="w-40"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-5">
            <Field label="AC" htmlFor="own-ac" error={showProblems ? problems.ac : undefined}>
              <Input
                id="own-ac"
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
              htmlFor="own-hp"
              hint="Your maximum. Where you are right now is your DM's to move."
              error={showProblems ? problems.hpMax : undefined}
            >
              <Input
                id="own-hp"
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
            htmlFor="own-sheet-url"
            hint="Where the real sheet lives, if it lives somewhere else."
            error={showProblems ? problems.url : undefined}
          >
            <Input
              id="own-sheet-url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={sheetUrl}
              aria-invalid={showProblems && problems.url !== undefined}
              onChange={(event) => setSheetUrl(event.target.value)}
            />
          </Field>
        </div>

        {/* In the footer, not at the end of the body: the body scrolls, and a
            line appended below the fold is one nobody sees. */}
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
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
