import type { CampaignId, Character, Visibility } from "@taverns/api";
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
import { Field, SaveFailure, VisibilityField } from "../ui/form";

/**
 * Writing down who is at the table.
 *
 * The Party tab has been read-only since it shipped and the endpoints have been
 * complete the whole time, so the only reason a campaign had no party was that
 * nothing could type one. This is that form, and it is deliberately the
 * `character` row **as it exists today** — five fields and a visibility. The
 * table is going to grow `level`, `species` and `class_name` as real columns
 * (the captain settled that separately), at which point `descriptor` stops
 * being a free-text line; building against the future shape now would mean
 * either a column that does not exist or a display string parsed into fields,
 * and the second is the thing that decision exists to stop.
 *
 * ### `descriptor` is prose, and stays prose here
 *
 * `Character.ts`: the display line is assembled from `descriptor` and
 * `playerName` rather than stored, which is why `PartyList` renders
 * `"Half-orc paladin · Ilse"` from two columns. The form asks for the two
 * columns, never the assembled line — a single "Ilse — Brannoc, half-orc
 * paladin" field is exactly the prototype's shape the model refused.
 *
 * ### The numbers are optional, and blank is not zero
 *
 * `ac` and `hpMax` are nullable, and a character the DM has not looked up yet
 * genuinely has neither. So blank sends nothing on create and `null` on update
 * — `PartyList` already renders each stat only when it is there, so an
 * unfilled AC is an absent stat rather than an `AC 0` nobody believes.
 */

/** Both match `Character.ts`'s own checks, so the sentence beats the schema to it. */
const MAX_AC = 40;
const MAX_HP = 10_000;

/** `""` ⇄ absent. A blank number field is "I have not filled this in". */
const parseOptional = (raw: string): number | null | undefined =>
  raw.trim() === "" ? null : Number.isInteger(Number(raw)) ? Number(raw) : undefined;

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
  const [descriptor, setDescriptor] = useState(character?.descriptor ?? "");
  const [acText, setAcText] = useState(character?.ac === null ? "" : String(character?.ac ?? ""));
  const [hpText, setHpText] = useState(
    character?.hpMax === null ? "" : String(character?.hpMax ?? ""),
  );
  // `dm` for a new character: the column default, and the only safe one to fail
  // to. Sharing the party is the campaign's own switch plus this one, in that
  // order — `campaign.visibility` is the gate this narrows within.
  const [visibility, setVisibility] = useState<Visibility>(character?.visibility ?? "dm");
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

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
  const problems: { name?: string; ac?: string; hpMax?: string } = {};
  if (name.trim() === "") problems.name = "Give them a name.";
  if (ac === undefined) problems.ac = "An armour class is a whole number.";
  else if (ac !== null && (ac < 0 || ac > MAX_AC)) problems.ac = `Between 0 and ${MAX_AC}.`;
  if (hpMax === undefined) problems.hpMax = "Hit points are a whole number.";
  else if (hpMax !== null && (hpMax < 0 || hpMax > MAX_HP)) {
    problems.hpMax = `Between 0 and ${MAX_HP.toLocaleString("en")}.`;
  }
  const refused = Object.keys(problems).length > 0;

  const save = async () => {
    setShowProblems(true);
    if (refused) return;

    const trimmedPlayer = playerName.trim();
    const trimmedDescriptor = descriptor.trim();

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
              ...(trimmedDescriptor === "" ? {} : { descriptor: trimmedDescriptor }),
              ...(ac === null ? {} : { ac }),
              ...(hpMax === null ? {} : { hpMax }),
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
              descriptor: trimmedDescriptor === "" ? null : trimmedDescriptor,
              ac,
              hpMax,
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

          <Field
            label="Descriptor"
            htmlFor="character-descriptor"
            hint="The half-line under the name — species and class, as you would say it aloud."
          >
            <Input
              id="character-descriptor"
              placeholder="Half-orc paladin"
              value={descriptor}
              onChange={(event) => setDescriptor(event.target.value)}
            />
          </Field>

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
