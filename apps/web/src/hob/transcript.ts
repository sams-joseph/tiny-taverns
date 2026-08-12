import type { AssistantTurnId, HobProposal } from "@taverns/api";
import type { IconName } from "@taverns/ui";

/**
 * What a Hob conversation is made of.
 *
 * **Three kinds of artifact are produced now** — `encounter`, `note` and `beat`
 * — and they are exactly the three things an accept can materialise. The rest of
 * the union is the delivered specimen set, rendered only by the gallery: nothing
 * produces an `npc`, a `checklist` or a `rules` card, because there is no table
 * for one to be saved into and a *Save to session* button that could only fail
 * is worse than a kind that cannot be expressed.
 *
 * It is written as data rather than as JSX because the delivered prototype
 * hard-codes each artifact body inline (`ChatParts.jsx`'s `EncounterBody`,
 * `ReadAloudBody`, …) and a real answer has to arrive over a wire.
 */

/**
 * The badge vocabulary, from `ChatParts.jsx`'s `KIND_META`.
 *
 * The delivery's table names eight kinds; five of them have a drawn body and
 * `rules` — which `ChatPanel.jsx` borrows the `hooks` badge for, because
 * `KIND_META` has no entry of its own for it — is the sixth thing a card can
 * be. The four with neither a body nor a card in any specimen (`creature`,
 * `location`, `loot`, `hooks`) are deliberately absent: an artifact union that
 * cannot express them is better than a card that renders a badge over an empty
 * body. They come back when the designers draw them.
 *
 * **`note` and `beat` are ours, and are the only two additions.** The delivery
 * has no entry for either, and both are things Hob can now actually offer to
 * save — a plain prep note and a line about what happened at the table. Both
 * take glyphs the delivery already asked for (`pencil`, `flag`), so the icon
 * table did not grow.
 */
export const ARTIFACT_KINDS = {
  encounter: { icon: "swords", label: "Encounter", variant: "default" },
  readaloud: { icon: "scroll-text", label: "Read-aloud", variant: "info" },
  note: { icon: "pencil", label: "Note", variant: "secondary" },
  beat: { icon: "flag", label: "Beat", variant: "default" },
  npc: { icon: "user-round", label: "NPC", variant: "magic" },
  checklist: { icon: "list-checks", label: "Prep list", variant: "success" },
  rules: { icon: "book-open", label: "Rules", variant: "secondary" },
} as const satisfies Record<
  string,
  { readonly icon: IconName; readonly label: string; readonly variant: string }
>;

export type HobArtifactKind = keyof typeof ARTIFACT_KINDS;

/** One line of an encounter roster: `×3  Bullywug Croaker  CR 1/4  11 hp`. */
export interface HobRosterLine {
  readonly count: number;
  readonly name: string;
  /** The rating as the DM says it — `"1/4"`, not a number. See the bestiary notes. */
  readonly cr: string;
  readonly hp: string;
}

export interface HobChecklistItem {
  readonly text: string;
  readonly done: boolean;
}

interface ArtifactBase {
  /**
   * The turn that produced it, for anything Hob really offered.
   *
   * Not a display detail: it is what `POST …/accept` names, and it is what the
   * accepted row's `assistantTurnId` will point at. The gallery's specimens use
   * made-up strings because nothing accepts them.
   */
  readonly id: string;
  /** Absent on a beat, which genuinely has none. */
  readonly title?: string;
  /** The one-line summary under the title — `"5 creatures · Adjusted XP 1,100"`. */
  readonly meta?: string;
  /** The predictable refinements, offered as chips. `"Make it harder"`, `"Shorter"`. */
  readonly chips: ReadonlyArray<string>;
}

export type HobArtifact =
  | (ArtifactBase & {
      readonly kind: "encounter";
      readonly roster: ReadonlyArray<HobRosterLine>;
      /** Absent from anything Hob proposes: no shipped column holds a creature's XP. */
      readonly adjustedXp?: string;
      /** The band, in the DM's words: `"Hard for 4 level-5s"`. */
      readonly verdict?: string;
    })
  | (ArtifactBase & { readonly kind: "readaloud"; readonly text: string })
  | (ArtifactBase & { readonly kind: "note"; readonly text: string })
  | (ArtifactBase & { readonly kind: "beat"; readonly text: string })
  | (ArtifactBase & {
      readonly kind: "npc";
      readonly species: string;
      readonly alignment: string;
      readonly summary: string;
      /** How to do the voice — the one thing a DM cannot look up. */
      readonly voice: string;
    })
  | (ArtifactBase & { readonly kind: "checklist"; readonly items: ReadonlyArray<HobChecklistItem> })
  | (ArtifactBase & { readonly kind: "rules"; readonly answer: string });

/**
 * A proposal from the wire, as the card the designers drew.
 *
 * The only translation in this direction, and it is deliberately lossless in the
 * half that matters and empty in the half that would have to be invented:
 * `chips` is `[]` because a refinement chip is copy the assistant is supposed to
 * author and a fixed client-side list would be a stub, and `adjustedXp` is
 * absent because no shipped column holds a creature's XP. The rule is the one
 * every screen here follows — do not render a field the API does not have.
 */
export const artifactFrom = (turnId: AssistantTurnId, proposal: HobProposal): HobArtifact => {
  switch (proposal.target) {
    case "encounter": {
      const creatures = proposal.roster.reduce((total, line) => total + line.count, 0);
      return {
        id: turnId,
        kind: "encounter",
        title: proposal.name,
        meta: `${creatures} ${creatures === 1 ? "creature" : "creatures"}`,
        chips: [],
        roster: proposal.roster.map((line) => ({
          count: line.count,
          name: line.name,
          cr: `CR ${line.cr}`,
          hp: `${line.hp} hp`,
        })),
        // The DMG band, as the DM's own vocabulary — `Difficulty` is
        // capitalised and rendered verbatim everywhere else too.
        ...(proposal.difficulty === null ? {} : { verdict: proposal.difficulty }),
      };
    }
    case "note":
      return {
        id: turnId,
        kind: proposal.kind === "read_aloud" ? "readaloud" : "note",
        title: proposal.title,
        chips: [],
        text: proposal.body,
      };
    case "beat":
      return { id: turnId, kind: "beat", chips: [], text: proposal.body };
  }
};

/**
 * A row in the thread.
 *
 * `aside` is the persona, and it lives in exactly one place by the designers'
 * rule: italic Alegreya at `--text-faint` under the reply, skippable, and the
 * only decorative writing in the app besides read-aloud text. UI text stays
 * plain — a control never speaks in character.
 */
export type HobTurn =
  | { readonly id: string; readonly who: "user"; readonly text: string }
  | { readonly id: string; readonly who: "hob"; readonly text: string; readonly aside?: string }
  | { readonly id: string; readonly who: "artifact"; readonly artifact: HobArtifact };

/** A chip in the "Knows" strip. `live` accents the one the DM has open. */
export interface HobContextChip {
  readonly icon: IconName;
  readonly label: string;
  readonly live?: boolean;
}

/** A card in the empty state's starter grid. */
export interface HobStarter {
  readonly icon: IconName;
  readonly title: string;
  readonly sub: string;
}
