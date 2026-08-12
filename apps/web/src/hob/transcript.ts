import type { IconName } from "@taverns/ui";

/**
 * What a Hob conversation is made of.
 *
 * **Nothing produces an `HobArtifact` yet**, though Hob answers: an answer is
 * prose, and a *proposal* is the propose-and-accept half that the captain's
 * generation decision names and that is not built. So this file is still a
 * description of the surface's input rather than of anything's output — see
 * `conversation.ts` for the seam, and `hob.fixtures.ts` for the delivered
 * sample the gallery and the tests render.
 *
 * It is written as data rather than as JSX because the delivered prototype
 * hard-codes each artifact body inline (`ChatParts.jsx`'s `EncounterBody`,
 * `ReadAloudBody`, …) and a real answer has to arrive over a wire. Typing the
 * five bodies the designers drew is the most useful thing this task can leave
 * behind: it says exactly what an assistant would have to return for the
 * screen to render, and it makes an undrawn kind unrepresentable rather than
 * half-rendered.
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
 */
export const ARTIFACT_KINDS = {
  encounter: { icon: "swords", label: "Encounter", variant: "default" },
  readaloud: { icon: "scroll-text", label: "Read-aloud", variant: "info" },
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
  readonly id: string;
  readonly title: string;
  /** The one-line summary under the title — `"5 creatures · Adjusted XP 1,100"`. */
  readonly meta?: string;
  /** The predictable refinements, offered as chips. `"Make it harder"`, `"Shorter"`. */
  readonly chips: ReadonlyArray<string>;
}

export type HobArtifact =
  | (ArtifactBase & {
      readonly kind: "encounter";
      readonly roster: ReadonlyArray<HobRosterLine>;
      readonly adjustedXp: string;
      /** The band, in the DM's words: `"Hard for 4 level-5s"`. */
      readonly verdict: string;
    })
  | (ArtifactBase & { readonly kind: "readaloud"; readonly text: string })
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
