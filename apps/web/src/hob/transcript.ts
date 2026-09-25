import {
  type AssistantTurnId,
  type EncounterChallenge,
  encounterKindLabel,
  type HobProposal,
} from "@taverns/api";
import type { IconName } from "@taverns/ui";

/**
 * What a Hob conversation is made of.
 *
 * **Seven kinds of artifact are produced here.** `encounter`, `note`
 * (and read-aloud) and `beat` are what campaign Hob can materialise; `chronicle`
 * and `story` are Shared World Hob's; `campaign` and `character` are what the
 * account's own panel drafts outside any campaign. The rest of the union is the
 * delivered specimen set, held by `hob.fixtures.ts` for the tests: nothing
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
 * **`note`, `beat`, `campaign` and `character` are ours.** The delivery has
 * no entry for any of them, and each is something Hob can actually offer to
 * keep. All four take glyphs the delivery already asked for (`pencil`, `flag`,
 * `layers` — the Campaigns item on the global row — and `user-round`), so the
 * icon table did not grow.
 */
export const ARTIFACT_KINDS = {
  encounter: { icon: "swords", label: "Encounter", variant: "default" },
  readaloud: { icon: "scroll-text", label: "Read-aloud", variant: "info" },
  note: { icon: "pencil", label: "Note", variant: "secondary" },
  beat: { icon: "flag", label: "Beat", variant: "default" },
  chronicle: { icon: "history", label: "Chronicle", variant: "default" },
  story: { icon: "book-open", label: "Story So Far", variant: "info" },
  npc: { icon: "user-round", label: "NPC", variant: "magic" },
  checklist: { icon: "list-checks", label: "Prep list", variant: "success" },
  rules: { icon: "book-open", label: "Rules", variant: "secondary" },
  campaign: { icon: "layers", label: "Campaign", variant: "default" },
  character: { icon: "user-round", label: "Character", variant: "magic" },
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
   * accepted row's `assistantTurnId` will point at. The test fixtures use
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
      /**
       * The line the encounter's battle map will be drawn from, when Hob wrote
       * one. Shown on the card because accepting draws the map from it.
       */
      readonly setting?: string;
      /**
       * A skill challenge's or a hazard's numbers as label and value —
       * `["DC", "14"]`, `["Save", "CON 13"]` — and the skills it names.
       */
      readonly challenge?: ReadonlyArray<readonly [string, string]>;
      readonly skills?: ReadonlyArray<string>;
      /** How to run it, in order, as the accept will write it. */
      readonly tactics?: ReadonlyArray<string>;
      readonly treasure?: string;
      /**
       * The adjusted XP and the band — `"Hard for 4 level-5s"`. Absent from
       * anything Hob proposes: both are computed on the saved encounter against
       * the party (`EncounterDifficulty.ts`), and a proposal is not one yet.
       */
      readonly adjustedXp?: string;
      readonly verdict?: string;
    })
  | (ArtifactBase & { readonly kind: "readaloud"; readonly text: string })
  | (ArtifactBase & { readonly kind: "note"; readonly text: string })
  | (ArtifactBase & { readonly kind: "beat"; readonly text: string })
  | (ArtifactBase & { readonly kind: "chronicle"; readonly text: string })
  | (ArtifactBase & { readonly kind: "story"; readonly text: string })
  | (ArtifactBase & {
      readonly kind: "npc";
      readonly race: string;
      readonly alignment: string;
      readonly summary: string;
      /** How to do the voice — the one thing a DM cannot look up. */
      readonly voice: string;
    })
  | (ArtifactBase & { readonly kind: "checklist"; readonly items: ReadonlyArray<HobChecklistItem> })
  | (ArtifactBase & {
      readonly kind: "campaign";
      /** The Shared World it will be made in; absent is a standalone campaign. */
      readonly world?: string;
      readonly partyName?: string;
      /** The pitch its one cover is drawn from, when Hob wrote one. */
      readonly pitch?: string;
    })
  | (ArtifactBase & {
      readonly kind: "character";
      /** Hob's reasons, one line each — the drafting screen's *What Hob did*. */
      readonly rationale: ReadonlyArray<string>;
      /** The line the portrait is drawn from, when Hob wrote one. */
      readonly appearance?: string;
    })
  | (ArtifactBase & { readonly kind: "rules"; readonly answer: string });

/**
 * A challenge's numbers as the drawing sets them out: a label over a value.
 * Only what was written — a hazard with no duration has no duration row.
 */
export const challengeFacts = (
  challenge: EncounterChallenge,
): ReadonlyArray<readonly [string, string]> =>
  challenge.kind === "challenge"
    ? [
        ["DC", String(challenge.dc)],
        ["Successes", String(challenge.successes)],
        ["Failures", String(challenge.failures)],
      ]
    : [
        ["Save", `${challenge.save.ability} ${challenge.save.dc}`],
        ...(challenge.onFail === undefined ? [] : [["On fail", challenge.onFail] as const]),
        ...(challenge.duration === undefined ? [] : [["Duration", challenge.duration] as const]),
      ];

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
      const kind = proposal.kind ?? "combat";
      const challenge = proposal.challenge;
      const count =
        creatures === 0 ? undefined : `${creatures} ${creatures === 1 ? "creature" : "creatures"}`;
      return {
        id: turnId,
        kind: "encounter",
        title: proposal.name,
        // A fight goes without saying; any other kind says so.
        meta:
          kind === "combat"
            ? (count ?? "No creatures")
            : [encounterKindLabel(kind), count].filter((part) => part !== undefined).join(" · "),
        chips: [],
        roster: proposal.roster.map((line) => ({
          count: line.count,
          name: line.name,
          cr: `CR ${line.cr}`,
          hp: `${line.hp} hp`,
        })),
        ...(proposal.setting === undefined ? {} : { setting: proposal.setting }),
        ...(challenge === undefined
          ? {}
          : { challenge: challengeFacts(challenge), skills: challenge.skills }),
        ...(proposal.tactics === undefined ? {} : { tactics: proposal.tactics }),
        ...(proposal.treasure === undefined ? {} : { treasure: proposal.treasure }),
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
    case "sharedWorldHistory":
      return {
        id: turnId,
        kind: "chronicle",
        ...(proposal.title === null ? {} : { title: proposal.title }),
        chips: [],
        text: proposal.body,
      };
    case "sharedWorldSummary":
      return {
        id: turnId,
        kind: "story",
        title: "Story So Far",
        meta: `Through Chronicle entry ${String(proposal.lastWorldSeq)}`,
        chips: [],
        text: proposal.text,
      };
    case "campaign":
      return {
        id: turnId,
        kind: "campaign",
        title: proposal.name,
        meta: proposal.world === null ? "Standalone campaign" : `In ${proposal.world.name}`,
        chips: [],
        ...(proposal.world === null ? {} : { world: proposal.world.name }),
        ...(proposal.partyName === null ? {} : { partyName: proposal.partyName }),
        ...(proposal.description === null ? {} : { pitch: proposal.description }),
      };
    /**
     * A character the account's panel drafted. The create screen's composer
     * draws its own, fuller card (`characters/DraftCard.tsx`) beside the form
     * it accelerates; here it is a card among the conversation's, with the
     * descriptor and Hob's reasons, and the sheet is one *Open it* away.
     */
    case "character": {
      const descriptor = [proposal.race, proposal.className]
        .filter((part): part is string => part !== null)
        .join(" ");
      const appearance = proposal.sheet.story?.appearance;
      return {
        id: turnId,
        kind: "character",
        title: proposal.name,
        meta: [descriptor, `Level ${String(proposal.level ?? 1)}`]
          .filter((part) => part !== "")
          .join(" · "),
        chips: [],
        rationale: proposal.rationale,
        ...(appearance === undefined ? {} : { appearance }),
      };
    }
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
