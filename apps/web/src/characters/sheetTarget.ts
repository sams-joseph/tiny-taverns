import type { CharacterSpellbook, NpcSpellbook, OwnedCharacter, SheetBody } from "@taverns/api";
import type { Effect } from "effect";
import type { AsyncResult, Atom } from "effect/reactivity";
import type { HttpClient } from "effect/http";
import type { TavernsClient } from "../api/client";
import type { Invalidation } from "../api/keys";
import { characterSpellsAtom } from "./load";
import { ownCharacterWrites, saveOwnCharacter } from "./write";

/** The spell picker's rules for one sheet: a character's, or an NPC's. */
export type Spellbook = CharacterSpellbook | NpcSpellbook;

/**
 * **What a section editor edits: any sheet's rules half, whoever holds it.**
 *
 * The abilities, skills, spells and gear dialogs are one editor each, and a
 * character's sheet and an NPC's (`cast/npcSheet.ts`) are the same document
 * under the same rules. What differs is only where the document is read and
 * written, so that is what a target carries and nothing else: the dialogs
 * never name an endpoint.
 *
 * ### `save` is a whole-document write, and it races
 *
 * Each dialog replaces one key of the document it was given and sends the
 * whole thing back, so a form never erases the parts it was not shown (the
 * skills behind the abilities, the spells behind the gear). Two editors do
 * not merge: the version the document was read at goes with every save, and a
 * sheet that moved on meanwhile is the server's `Conflict`, offered *Reload*.
 */
export interface SheetTarget {
  /**
   * Whose sheet it is, for the dialogs' words: `null` is the reader's own
   * (*your abilities*), a name is an NPC's (*Brother Aldric’s abilities*).
   */
  readonly name: string | null;
  /** The document as it was read. */
  readonly sheet: SheetBody;
  /** Replace the document, at the version it was read at. */
  readonly save: (
    client: TavernsClient,
    sheet: SheetBody,
  ) => Effect.Effect<unknown, unknown, HttpClient.HttpClient>;
  /** What a save changes. */
  readonly writes: Invalidation;
  /** The spell picker's rules for this sheet, against the rules it is written in. */
  readonly spellbook: Atom.Atom<AsyncResult.AsyncResult<Spellbook, unknown>>;
  /** What the spell picker says when those rules offer no spell. */
  readonly noSpells: string;
}

/**
 * A player's own character: the `/me` write with its version
 * (`saveOwnCharacter`), and the player's half of the document (the notes, the
 * story, the journal) carried through untouched under whatever the editor
 * changed.
 */
export const characterSheetTarget = (owned: OwnedCharacter): SheetTarget => {
  const character = owned.character;
  return {
    name: null,
    sheet: character.sheet,
    save: (client, sheet) =>
      saveOwnCharacter(client, character, { sheet: { ...character.sheet, ...sheet } }),
    writes: ownCharacterWrites(owned),
    spellbook: characterSpellsAtom(character.id),
    noSpells:
      owned.seats.length === 0
        ? "No spells are available for this class and level in the core rules."
        : "No spells are available for this class and level from any table this character is at.",
  };
};

/** *your* or *Aldric’s*, for a dialog's title and accessible name. */
export const whose = (target: SheetTarget): string =>
  target.name === null ? "your" : `${target.name}’s`;
