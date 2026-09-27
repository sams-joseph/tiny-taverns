import type {
  AssistantThreadId,
  AssistantTurnId,
  CampaignCharacterId,
  Session,
} from "@taverns/api";
import { describe, expect, it } from "vitest";
import { entryPatch, nightToWriteUp, spotlightName } from "./entry";

/** Only the fields these rules read; the rest of a `Session` is not their business. */
const night = (over: Omit<Partial<Session>, "id"> & { readonly id?: string }): Session =>
  ({
    id: "s",
    number: 1,
    title: null,
    startedAt: null,
    endedAt: null,
    summary: null,
    spotlightSeatId: null,
    ...over,
  }) as unknown as Session;

const played = { startedAt: {} as Session["startedAt"] };

describe("the night the composer writes up", () => {
  it("is the newest night that has been played, while it has no summary", () => {
    const newest = night({ id: "12", number: 12, ...played });
    const older = night({ id: "11", number: 11, ...played });
    expect(nightToWriteUp([newest, older])?.id).toBe("12");
  });

  it("skips a night nobody has started, which has nothing to write about", () => {
    const planned = night({ id: "13", number: 13 });
    const newest = night({ id: "12", number: 12, ...played });
    expect(nightToWriteUp([planned, newest])?.id).toBe("12");
  });

  it("is nothing once the newest played night has one — not a queue of older nights", () => {
    const newest = night({ id: "12", number: 12, ...played, summary: "Written." });
    const older = night({ id: "11", number: 11, ...played });
    expect(nightToWriteUp([newest, older])).toBeUndefined();
    expect(nightToWriteUp([])).toBeUndefined();
  });
});

describe("whose night it was", () => {
  const seat = "seat-1" as CampaignCharacterId;
  const party = [
    { seat: { id: seat, displayName: "Brannoc at join" }, character: { name: "Brannoc" } },
  ] as never;

  it("is the seat's character by name", () => {
    expect(spotlightName(night({ spotlightSeatId: seat }), party)).toBe("Brannoc");
  });

  it("says nothing for nobody, or for a seat this reader's party does not hold", () => {
    expect(spotlightName(night({}), party)).toBeUndefined();
    expect(
      spotlightName(night({ spotlightSeatId: "gone" as CampaignCharacterId }), party),
    ).toBeUndefined();
  });
});

describe("what the composer sends", () => {
  const draft = {
    threadId: "t" as AssistantThreadId,
    turnId: "u" as AssistantTurnId,
    text: "Hob's words.",
  };

  it("sends the DM's words, a trimmed title, and blank as no title", () => {
    expect(
      entryPatch({
        title: "  The ferry ",
        summary: " Words. ",
        spotlightSeatId: null,
        draft: undefined,
      }),
    ).toEqual({ title: "The ferry", spotlightSeatId: null, summary: "Words." });
    expect(
      entryPatch({ title: "   ", summary: "Words.", spotlightSeatId: null, draft: undefined }),
    ).toEqual({ title: null, spotlightSeatId: null, summary: "Words." });
  });

  it("leaves the summary out when it is Hob's draft unedited, since the accept wrote it", () => {
    expect(
      entryPatch({ title: "", summary: "Hob's words.", spotlightSeatId: null, draft }),
    ).toEqual({ title: null, spotlightSeatId: null });
  });

  it("sends an edited draft, which the server keeps as Hob's", () => {
    expect(
      entryPatch({ title: "", summary: "Hob's words, and mine.", spotlightSeatId: null, draft }),
    ).toEqual({ title: null, spotlightSeatId: null, summary: "Hob's words, and mine." });
  });
});
