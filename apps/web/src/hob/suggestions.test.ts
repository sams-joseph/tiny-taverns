import { describe, expect, it } from "vitest";
import { type AccountScreen, hobOpeningFor, type HobKnown } from "./suggestions";

/**
 * The one mapping from where the reader is to what Hob offers, pinned.
 *
 * The property that matters is that a starter never offers something the
 * toolkit behind it cannot do: the account's panel drafts a campaign or a
 * character (`proposeCampaign`, `proposeCharacter`) and nothing else, and a
 * campaign's panel never offers to start another campaign.
 */

const titles = (screen: AccountScreen, known: HobKnown = {}) =>
  hobOpeningFor({ kind: "account", screen, known }).starters.map((starter) => starter.title);

const SCREENS: ReadonlyArray<AccountScreen> = [
  "campaigns",
  "sharedWorlds",
  "characters",
  "library",
  "elsewhere",
];

describe("the account's panel", () => {
  it.each(SCREENS)("offers only the two things it drafts, on %s", (screen) => {
    for (const known of [{}, { campaigns: 0, characters: 0, sharedWorlds: 0 }, { sharedWorlds: 2 }])
      for (const title of titles(screen, known))
        expect(title).toMatch(/^Draft (my first|another|a) (campaign|character)\b/);
  });

  it("never offers campaign content", () => {
    const every = SCREENS.flatMap((screen) => titles(screen, { sharedWorlds: 1 })).join(" ");
    expect(every).not.toMatch(/encounter|note|read-aloud|session|NPC|Chronicle/i);
  });

  it("puts what the screen is about first", () => {
    expect(titles("campaigns")[0]).toMatch(/campaign/);
    expect(titles("characters")[0]).toMatch(/character/);
    expect(titles("sharedWorlds", { sharedWorlds: 1 })[0]).toBe(
      "Draft a campaign in one of my Shared Worlds",
    );
  });

  it("says first when the list it knows is empty, another when it is not, and neither unknown", () => {
    expect(titles("campaigns", { campaigns: 0 })[0]).toBe("Draft my first campaign");
    expect(titles("campaigns", { campaigns: 3 })[0]).toBe("Draft another campaign");
    expect(titles("campaigns")[0]).toBe("Draft a campaign");
    expect(titles("characters", { characters: 0 })[0]).toBe("Draft my first character");
    expect(titles("characters", { characters: 1 })[0]).toBe("Draft another character");
    expect(titles("characters")[0]).toBe("Draft a character");
  });

  it("offers a Shared World only to somebody known to be in one", () => {
    const inAWorld = "Draft a campaign in one of my Shared Worlds";
    expect(titles("campaigns", { sharedWorlds: 1 })).toContain(inAWorld);
    expect(titles("campaigns", { sharedWorlds: 0 })).not.toContain(inAWorld);
    // Unknown is not guessed.
    expect(titles("campaigns")).not.toContain(inAWorld);
    expect(titles("library", { sharedWorlds: 4 })).not.toContain(inAWorld);
  });

  it("says what it cannot see from here", () => {
    const opening = hobOpeningFor({ kind: "account", screen: "elsewhere", known: {} });
    expect(opening.description).toMatch(/can’t see inside your campaigns/);
  });
});

describe("a campaign's and a Shared World's panels", () => {
  it("keep the campaign's delivered starters, and never offer a new campaign", () => {
    const opening = hobOpeningFor({ kind: "campaign" });
    expect(opening.title).toBeUndefined();
    expect(opening.starters.map((starter) => starter.title)).toEqual([
      "Build an encounter",
      "Name an NPC",
      "Write read-aloud text",
      "Prep tonight's session",
    ]);
  });

  it("keep the Shared World's history starters", () => {
    const opening = hobOpeningFor({ kind: "sharedWorld" });
    expect(opening.title).toBe("What should we remember together?");
    const every = opening.starters.map((starter) => starter.title).join(" ");
    expect(every).not.toMatch(/Draft|encounter/);
  });
});
