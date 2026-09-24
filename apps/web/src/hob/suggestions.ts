import { HOB_STARTERS, SHARED_WORLD_HOB_STARTERS } from "./hob.fixtures";
import type { HobStarter } from "./transcript";

/**
 * What Hob offers to do before anything is asked, by where the reader is.
 *
 * **The one mapping from place to suggestion**, so a starter can never offer
 * what the toolkit behind it cannot do. Each scope's server toolkit is fixed
 * (`apps/server/src/assistant/toolkit.ts`), and each arm here speaks only of
 * what its toolkit builds:
 *
 * - **campaign** — the creator's panel: encounters, notes, read-aloud, prep.
 *   The delivered starters, unchanged.
 * - **sharedWorld** — the world's canonical history: never campaign prep.
 * - **account** — every screen outside both: the panel drafts a campaign or a
 *   character, and nothing that needs a campaign (no encounter, no note), which
 *   is exactly `proposeCampaign` and `proposeCharacter`.
 *
 * Within the account arm the order and the wording follow the screen and what
 * already exists there: on the Campaigns list a campaign comes first, on the
 * roster a character does, and an empty list says *first*. Counts are only
 * what the screen behind the panel already read (`known`); an absent count is
 * simply not said, rather than guessed.
 *
 * A starter's `title` is sent as the question when it is picked, so each one is
 * a request Hob can act on as written.
 */
export type AccountScreen = "campaigns" | "sharedWorlds" | "characters" | "library" | "elsewhere";

/** What the screen behind the panel has already read; absent is unknown. */
export interface HobKnown {
  readonly campaigns?: number;
  readonly characters?: number;
  readonly sharedWorlds?: number;
}

export type HobPlace =
  | { readonly kind: "campaign" }
  | { readonly kind: "sharedWorld" }
  | { readonly kind: "account"; readonly screen: AccountScreen; readonly known: HobKnown };

/** The empty conversation's heading, line and starters. Absent copy is the panel's default. */
export interface HobOpening {
  readonly title?: string;
  readonly description?: string;
  readonly starters: ReadonlyArray<HobStarter>;
}

/**
 * *My first* when the screen knows the list is empty, *another* when it knows
 * it is not, and neither when it does not know.
 */
const draftCampaign = (known: HobKnown): HobStarter => ({
  icon: "layers",
  title:
    known.campaigns === undefined
      ? "Draft a campaign"
      : known.campaigns === 0
        ? "Draft my first campaign"
        : "Draft another campaign",
  sub:
    known.campaigns === 0
      ? "Give me a premise and I’ll pitch a table you can keep"
      : "A name, a party and a pitch to draw its cover from",
});

const draftInAWorld: HobStarter = {
  icon: "map",
  title: "Draft a campaign in one of my Shared Worlds",
  sub: "A new table that shares a world you’re already in",
};

const draftCharacter = (known: HobKnown): HobStarter => ({
  icon: "user-round",
  title:
    known.characters === undefined
      ? "Draft a character"
      : known.characters === 0
        ? "Draft my first character"
        : "Draft another character",
  sub:
    known.characters === 0
      ? "Describe someone and I’ll make them a sheet"
      : "From the core rules, ready to seat at any table",
});

/** The account arm's starters, in the order the screen puts first. */
const accountStarters = (screen: AccountScreen, known: HobKnown): ReadonlyArray<HobStarter> => {
  const inAWorld = (known.sharedWorlds ?? 0) > 0 ? [draftInAWorld] : [];
  switch (screen) {
    case "campaigns":
      return [draftCampaign(known), ...inAWorld, draftCharacter(known)];
    case "sharedWorlds":
      return [...inAWorld, draftCampaign(known), draftCharacter(known)];
    case "characters":
    case "library":
    case "elsewhere":
      return [draftCharacter(known), draftCampaign(known)];
  }
};

export const hobOpeningFor = (place: HobPlace): HobOpening => {
  switch (place.kind) {
    case "campaign":
      return { starters: HOB_STARTERS };
    case "sharedWorld":
      return {
        title: "What should we remember together?",
        description: "I know the Chronicle and the played history shared across this world.",
        starters: SHARED_WORLD_HOB_STARTERS,
      };
    case "account":
      return {
        title: "What shall we start?",
        description:
          "I can draft a campaign for you to run or a character to play. I can’t see " +
          "inside your campaigns from here: open one to plan in it.",
        starters: accountStarters(place.screen, place.known),
      };
  }
};
