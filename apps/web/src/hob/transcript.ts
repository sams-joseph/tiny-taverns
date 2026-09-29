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
 * **Eleven kinds of artifact are produced here.** `encounter`, `note`
 * (and read-aloud), `beat`, `npc`, `npcSheet`, `checklist` (the next night
 * Hob planned, drawn as the delivered prep list) and `act` are what campaign
 * Hob can materialise; `chronicle`
 * and `story` are Shared World Hob's; `campaign` and `character` are what the
 * account's own panel drafts outside any campaign. The rest of the union is the
 * delivered specimen set, held by `hob.fixtures.ts` for the tests: nothing
 * produces a `rules` card, because there is no table
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
 * **`note`, `beat`, `summary`, `campaign`, `sharedWorld`, `character`,
 * `npcSheet` and `act` are ours.** The delivery has no entry for any of them,
 * and each is something Hob can actually offer to keep. All eight take glyphs
 * the delivery already asked for (`pencil`, `flag` — the beat's, and the
 * Chronicle's *Start a new act here* —, `history` — the Chronicle's own —,
 * `layers` — the Campaigns item on the global row —, `map` — a Shared World's
 * own in the bar —, `user-round` and `shield-half`, the sheet's armour
 * class), so the icon table did not grow.
 */
export const ARTIFACT_KINDS = {
  encounter: { icon: "swords", label: "Encounter", variant: "default" },
  readaloud: { icon: "scroll-text", label: "Read-aloud", variant: "info" },
  note: { icon: "pencil", label: "Note", variant: "secondary" },
  beat: { icon: "flag", label: "Beat", variant: "default" },
  summary: { icon: "history", label: "Night summary", variant: "info" },
  chronicle: { icon: "history", label: "Chronicle", variant: "default" },
  story: { icon: "book-open", label: "Story So Far", variant: "info" },
  campaignStory: { icon: "book-open", label: "Story so far", variant: "info" },
  npc: { icon: "user-round", label: "NPC", variant: "magic" },
  checklist: { icon: "list-checks", label: "Prep list", variant: "success" },
  act: { icon: "flag", label: "Act", variant: "secondary" },
  rules: { icon: "book-open", label: "Rules", variant: "secondary" },
  campaign: { icon: "layers", label: "Campaign", variant: "default" },
  sharedWorld: { icon: "map", label: "Shared World", variant: "default" },
  character: { icon: "user-round", label: "Character", variant: "magic" },
  npcSheet: { icon: "shield-half", label: "NPC sheet", variant: "magic" },
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
      /**
       * What a skill challenge leads to, as label and sentence — `["On
       * success", "They find the cache."]`. Prose rather than a number, so
       * drawn as a line rather than beside the DC; only what was written.
       */
      readonly outcomes?: ReadonlyArray<readonly [string, string]>;
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
  | (ArtifactBase & { readonly kind: "summary"; readonly text: string })
  | (ArtifactBase & { readonly kind: "chronicle"; readonly text: string })
  | (ArtifactBase & { readonly kind: "story"; readonly text: string })
  | (ArtifactBase & {
      readonly kind: "campaignStory";
      readonly text: string;
      /** Read to the players to open the next night, when Hob wrote one. */
      readonly previously?: string;
    })
  | (ArtifactBase & {
      /**
       * A new member of the Cast. The delivered specimen drew a race and an
       * alignment over the summary; an NPC has neither, so the card draws what
       * the draft carries, and the role and the sheet's line are its meta.
       */
      readonly kind: "npc";
      /** The one paragraph of who they are, when Hob wrote one. */
      readonly summary?: string;
      /** The line the portrait is drawn from, when Hob wrote one. */
      readonly appearance?: string;
      /** How to do the voice — the one thing a DM cannot look up. */
      readonly voice?: string;
      readonly wants?: string;
      /** The sheet's seeded numbers, as `npcSheet`'s are; empty with no sheet. */
      readonly stats: ReadonlyArray<readonly [string, string]>;
    })
  | (ArtifactBase & {
      readonly kind: "checklist";
      readonly items: ReadonlyArray<HobChecklistItem>;
      /** The session number a planned night was kept as, once this conversation kept it. */
      readonly plannedAs?: number;
    })
  | (ArtifactBase & {
      /** A new act on the Chronicle; its title is the card's, its first night the meta. */
      readonly kind: "act";
    })
  | (ArtifactBase & {
      readonly kind: "campaign";
      /** The Shared World it will be made in; absent is a standalone campaign. */
      readonly world?: string;
      readonly partyName?: string;
      /** The pitch its one cover is drawn from, when Hob wrote one. */
      readonly pitch?: string;
    })
  | (ArtifactBase & {
      readonly kind: "sharedWorld";
      /** What the world is, which its one cover is drawn from, when Hob wrote one. */
      readonly description?: string;
    })
  | (ArtifactBase & {
      readonly kind: "character";
      /** Hob's reasons, one line each — the drafting screen's *What Hob did*. */
      readonly rationale: ReadonlyArray<string>;
      /** The line the portrait is drawn from, when Hob wrote one. */
      readonly appearance?: string;
    })
  | (ArtifactBase & {
      readonly kind: "npcSheet";
      /** The seeded numbers as label and value — `["AC", "16"]`, `["HP", "44"]`. */
      readonly stats: ReadonlyArray<readonly [string, string]>;
      /** The sheet the NPC has now, which keeping this one replaces. */
      readonly replaces?: string;
      /** Hob's reasons, one line each. */
      readonly rationale: ReadonlyArray<string>;
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

/** A skill challenge's outcome lines, as {@link challengeFacts} sets out its numbers. */
const challengeOutcomes = (
  challenge: EncounterChallenge,
): ReadonlyArray<readonly [string, string]> =>
  challenge.kind === "challenge"
    ? [
        ...(challenge.onSuccess === undefined
          ? []
          : [["On success", challenge.onSuccess] as const]),
        ...(challenge.onFailure === undefined
          ? []
          : [["On failure", challenge.onFailure] as const]),
      ]
    : [];

/** The numbers a drafted NPC sheet was seeded with. */
interface DraftedSheet {
  readonly level: number;
  readonly race: string | null;
  readonly subrace: string | null;
  readonly className: string;
  readonly ac: number | null;
  readonly hpMax: number | null;
  readonly cr: string | null;
}

/** `["Level 5 Hill Dwarf Fighter", "CR 3"]` — a drafted sheet's meta, as the sheet's descriptor reads. */
const sheetLine = (sheet: DraftedSheet): ReadonlyArray<string> => [
  [`Level ${String(sheet.level)}`, sheet.subrace ?? sheet.race, sheet.className]
    .filter((part): part is string => part !== null)
    .join(" "),
  ...(sheet.cr === null ? [] : [`CR ${sheet.cr}`]),
];

/** A drafted sheet's seeded armour class and hit points, as label and value. */
const sheetStats = (sheet: DraftedSheet): ReadonlyArray<readonly [string, string]> => [
  ...(sheet.ac === null ? [] : [["AC", String(sheet.ac)] as const]),
  ...(sheet.hpMax === null ? [] : [["HP", String(sheet.hpMax)] as const]),
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
          : {
              challenge: challengeFacts(challenge),
              outcomes: challengeOutcomes(challenge),
              skills: challenge.skills,
            }),
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
    case "nightSummary":
      return {
        id: turnId,
        kind: "summary",
        title: `Session ${String(proposal.sessionNumber)}`,
        meta: "For the Chronicle",
        chips: [],
        text: proposal.text,
      };
    /**
     * A night the creator's Hob planned, as the delivered prep list:
     * its title (or *Planned session* when it has none), each line
     * unticked, and the act it starts when it names one. No number: the keep
     * numbers the night one past the highest the campaign has then.
     */
    case "night":
      return {
        id: turnId,
        kind: "checklist",
        title: proposal.title ?? "Planned session",
        meta: [
          `${String(proposal.prep.length)} prep ${proposal.prep.length === 1 ? "line" : "lines"}`,
          ...(proposal.actTitle === null ? [] : [`Starts ${proposal.actTitle}`]),
        ].join(" · "),
        chips: [],
        items: proposal.prep.map((text) => ({ text, done: false })),
      };
    case "act":
      return {
        id: turnId,
        kind: "act",
        title: proposal.title,
        meta: `From session ${String(proposal.firstSessionNumber)}`,
        chips: [],
      };
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
    case "campaignStory":
      return {
        id: turnId,
        kind: "campaignStory",
        title: "The story so far",
        meta:
          proposal.afterSessionNumber === 0
            ? "Before any session has ended"
            : `Through session ${String(proposal.afterSessionNumber)}`,
        chips: [],
        text: proposal.text,
        ...(proposal.previously === null ? {} : { previously: proposal.previously }),
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
    case "sharedWorld":
      return {
        id: turnId,
        kind: "sharedWorld",
        title: proposal.name,
        meta: "A new Shared World you will own",
        chips: [],
        ...(proposal.description === null ? {} : { description: proposal.description }),
      };
    /**
     * An NPC's sheet the creator's Hob drafted: the NPC by name, the line its
     * sheet will read, and the numbers the seed worked out, and what keeping
     * it replaces. The document itself is not drawn here: it is the sheet.
     */
    case "npcSheet":
      return {
        id: turnId,
        kind: "npcSheet",
        title: proposal.npcName,
        meta: sheetLine(proposal).join(" · "),
        chips: [],
        stats: sheetStats(proposal),
        ...(proposal.replaces === null
          ? {}
          : { replaces: proposal.replaces.descriptor ?? "The sheet it has now" }),
        rationale: proposal.rationale,
      };
    /**
     * A new NPC the creator's Hob drafted for the Cast: the name, the role and
     * the sheet's line when it has one, then what the drawer shows first — who
     * they are, how they look, the voice and what they want. The secret and
     * the prep are kept but not drawn here; the drawer shows them once kept.
     */
    case "npc": {
      const { identity, voice, intent } = proposal.persona;
      return {
        id: turnId,
        kind: "npc",
        title: proposal.name,
        meta: [
          ...(proposal.role === "" ? [] : [proposal.role]),
          ...(proposal.sheet === null ? [] : sheetLine(proposal.sheet)),
        ].join(" · "),
        chips: [],
        ...(identity?.summary === undefined ? {} : { summary: identity.summary }),
        ...(identity?.appearance === undefined ? {} : { appearance: identity.appearance }),
        ...(voice?.manner === undefined ? {} : { voice: voice.manner }),
        ...(intent?.wants === undefined ? {} : { wants: intent.wants }),
        stats: proposal.sheet === null ? [] : sheetStats(proposal.sheet),
      };
    }
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
