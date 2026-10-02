import type { Equipment, NpcSheet } from "@taverns/api";
import {
  Badge,
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
  SectionHeading,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useInvalidate } from "../api/atoms";
import { useMutation } from "../api/mutation";
import { AbilitiesDialog } from "../characters/AbilitiesDialog";
import { GearDialog } from "../characters/GearDialog";
import { drawnSections } from "../characters/sheet";
import { SheetDocument } from "../characters/SheetDocument";
import { StatPill } from "../characters/SheetParts";
import { SkillsDialog } from "../characters/SkillsDialog";
import { SpellPickerDialog } from "../characters/SpellPickerDialog";
import { SaveFailure } from "../ui/form";
import { challengeLine, npcSheetEditor, type NpcSheetTarget } from "./npcSheet";
import { NpcQuickStartDialog } from "./NpcQuickStartDialog";
import { NpcSheetDialog } from "./NpcSheetDialog";
import { NpcSheetFromBestiaryDialog } from "./NpcSheetFromBestiaryDialog";

/** The NPC sheet has no spine to scroll to its sections, so nothing registers. */
const ignoreSection = () => undefined;

/** Which of the sheet's dialogs is open. */
type Editing =
  | "identity"
  | "start"
  | "bestiary"
  | "abilities"
  | "skills"
  | "spells"
  | "gear"
  | "remove";

/**
 * An NPC's stats: **the character sheet's own document and its own section
 * editors**, under a header of the identity columns — what the NPC page's
 * *Stats* tab draws.
 *
 * It takes a target rather than a campaign, so any NPC's sheet draws and
 * writes the same way whoever's endpoints hold it (`NpcSheetTarget`).
 *
 * **The document is the character's renderer** (`SheetDocument`) over the
 * sheet's rules half, with the character's abilities, skills, spells and gear
 * dialogs in its section headers (`npcSheetEditor`). It edits but does not
 * play: nothing on it rolls or spends until an NPC can take part in a fight.
 * The identity is the header's (*Write one*, *Edit stats*), beside the quick
 * starts (*Start from class and level*, and *Rebuild* over a sheet, which asks
 * first; *Start from a bestiary NPC*, a stat block translated whole, from an
 * empty tab) and *Remove*, which asks first — the document goes with it.
 *
 * **DM prep, and it says so.** No player reads an NPC's sheet: it is not on
 * the NPC a player sees, nor in search, nor in anything the NPC is told.
 */
export function NpcSheetPanel({
  name,
  sheet,
  gear,
  target,
}: {
  /** The NPC's name, for the copy. */
  readonly name: string;
  /** `null`: the DM has not written one. */
  readonly sheet: NpcSheet | null;
  /** The equipment rows the sheet's gear lines name (`NpcStats.gear`). */
  readonly gear: ReadonlyArray<Equipment>;
  readonly target: NpcSheetTarget;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const invalidate = useInvalidate();
  const close = () => setEditing(null);
  // A refusal for a sheet that moved on: read it again and start over from it.
  const reloadAndClose = () => {
    invalidate(target.writes);
    close();
  };
  const editor = sheet === null ? undefined : npcSheetEditor(name, sheet, target);

  const dialogs = (
    <>
      {editing === "identity" && (
        <NpcSheetDialog name={name} sheet={sheet} target={target} onClose={close} onSaved={close} />
      )}
      {editing === "start" && (
        <NpcQuickStartDialog
          name={name}
          sheet={sheet}
          target={target}
          onClose={close}
          onSaved={close}
        />
      )}
      {editing === "bestiary" && sheet === null && (
        <NpcSheetFromBestiaryDialog name={name} target={target} onClose={close} onSaved={close} />
      )}
      {editor !== undefined && editing === "abilities" && (
        <AbilitiesDialog
          target={editor}
          onClose={close}
          onSaved={close}
          onReload={reloadAndClose}
        />
      )}
      {editor !== undefined && editing === "skills" && (
        <SkillsDialog target={editor} onClose={close} onSaved={close} onReload={reloadAndClose} />
      )}
      {editor !== undefined && editing === "spells" && (
        <SpellPickerDialog
          target={editor}
          onClose={close}
          onSaved={close}
          onReload={reloadAndClose}
        />
      )}
      {editor !== undefined && editing === "gear" && (
        <GearDialog
          target={editor}
          rows={gear}
          onClose={close}
          onSaved={close}
          onReload={reloadAndClose}
        />
      )}
      {editing === "remove" && sheet !== null && (
        <RemoveSheetDialog name={name} target={target} onClose={close} />
      )}
    </>
  );

  if (sheet === null) {
    return (
      <div data-slot="npc-sheet" className="flex flex-col">
        <EmptyState
          icon="swords"
          title="No stats yet"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing("start")}>
                <Icon name="wand-sparkles" size={14} />
                Start from class and level
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing("bestiary")}>
                <Icon name="footprints" size={14} />
                Start from a bestiary NPC
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing("identity")}>
                <Icon name="plus" size={14} />
                Write one
              </Button>
            </div>
          }
        >
          Start {name} from a class at a level, with the features, spell slots and kit a character
          of it has, or from a Guard, a Veteran or a Mage in the bestiary; or write the level, the
          armour class and hit points a fight reads, and a challenge rating, yourself. Only you see
          them.
        </EmptyState>
        {dialogs}
      </div>
    );
  }

  // Writable, so the abilities and the gear draw empty to be filled in; the
  // player's half is not on an NPC's document, so there is no story to write.
  const sections = drawnSections(sheet.sheet, true);

  return (
    <div data-slot="npc-sheet" className="flex flex-col gap-gutter">
      <Card className="gap-4 p-card">
        {/* The actions beside the heading where the column allows, under it on
            a phone, where beside it they squeezed the descriptor to a word a line. */}
        <div className="flex flex-col gap-3 @md:flex-row @md:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SectionHeading size="title">
                {sheet.descriptor ?? "No level or class yet"}
              </SectionHeading>
              <Badge variant="magic">
                <Icon name="eye-off" size={11} />
                DM only
              </Badge>
            </div>
            {sheet.cr !== null && (
              <p className="mb-0 text-body-s leading-body text-muted-foreground">
                {challengeLine(sheet.cr)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing("identity")}>
              <Icon name="pencil" size={14} />
              Edit stats
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing("start")}>
              <Icon name="wand-sparkles" size={14} />
              Rebuild from class and level
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing("remove")}>
              <Icon name="trash-2" size={14} />
              Remove
            </Button>
          </div>
        </div>

        {(sheet.ac !== null || sheet.hpMax !== null) && (
          <div className="grid grid-cols-2 gap-1.5 @md:grid-cols-4">
            {sheet.ac !== null && <StatPill label="Armour class" value={sheet.ac} />}
            {sheet.hpMax !== null && <StatPill label="Max HP" value={sheet.hpMax} />}
          </div>
        )}
      </Card>

      <section aria-label={`${name}'s sheet`} className="flex min-w-0">
        <SheetDocument
          sheet={sheet.sheet}
          gearRows={gear}
          sections={sections}
          register={ignoreSection}
          edits={{
            reader: "dm",
            onEditAbilities: () => setEditing("abilities"),
            onEditSkills: () => setEditing("skills"),
            onEditSpells: () => setEditing("spells"),
            onEditGear: () => setEditing("gear"),
          }}
          play={undefined}
        />
      </section>
      {dialogs}
    </div>
  );
}

/**
 * Removing an NPC's sheet: the reverse of *Write one*. It asks first, because
 * the document goes with it and nothing brings it back; the NPC itself, its
 * persona and its prep are untouched, and so is every copy of a Library
 * original's.
 */
function RemoveSheetDialog({
  name,
  target,
  onClose,
}: {
  readonly name: string;
  readonly target: NpcSheetTarget;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const remove = async () => {
    const done = await submit((client) => target.remove(client), target.writes);
    if (Result.isSuccess(done)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={`Remove ${name}’s stats`}>
        <DialogHeader>
          <DialogTitle>Remove {name}&rsquo;s stats?</DialogTitle>
          <DialogDescription>
            Their whole sheet goes: the level, the numbers and everything on it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            {target.home === "library"
              ? `${name} stays in your Library, with their persona. A copy already in a campaign keeps its own stats. To give them stats again, write a new sheet.`
              : `${name} stays in the cast, with their persona and your prep. To give them stats again, write a new sheet.`}
          </p>
        </div>

        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep them
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove()}>
            {busy ? "Removing…" : "Remove stats"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
