import { describe, expect, it } from "vitest";
import { campaignImageHasSubject, campaignImagePromptFor } from "./CampaignImage.js";
import { HOUSE_COVER_STYLE, HOUSE_PORTRAIT_STYLE } from "./HouseStyle.js";

const style = { style: HOUSE_COVER_STYLE };

describe("campaignImagePromptFor", () => {
  it("asks for the place the name suggests, in the house style framed as a cover", () => {
    const prompt = campaignImagePromptFor({ name: "The Salt Road", partyName: null }, style);
    expect(prompt).toBe(
      "Wide establishing scene for a fantasy adventure called The Salt Road: the place and " +
        "the mood that title suggests, shown rather than written. " +
        HOUSE_COVER_STYLE,
    );
  });

  it("names the party when the table has given it one", () => {
    const prompt = campaignImagePromptFor(
      { name: "The Salt Road", partyName: "The Iron Crows" },
      style,
    );
    expect(prompt).toContain("known as The Iron Crows");
    expect(prompt.endsWith(HOUSE_COVER_STYLE)).toBe(true);
  });

  it("strips quotes and runs of space, and bounds each label", () => {
    const prompt = campaignImagePromptFor(
      { name: `  "The   Drowned\nKing"  `, partyName: "x".repeat(400) },
      style,
    );
    expect(prompt).toContain("called The Drowned King:");
    expect(prompt).not.toContain('"');
    expect(prompt).not.toContain("x".repeat(121));
  });
});

describe("campaignImageHasSubject", () => {
  it("draws any campaign with a name, and skips one named in nothing but space and quotes", () => {
    expect(campaignImageHasSubject({ name: "Rime", partyName: null })).toBe(true);
    expect(campaignImageHasSubject({ name: "  “” ", partyName: "The Crows" })).toBe(false);
  });
});

describe("the house style", () => {
  it("keeps the portrait style a character has always been drawn in, word for word", () => {
    expect(HOUSE_PORTRAIT_STYLE).toBe(
      "Painterly fantasy illustration, cool and low-key, slight grain, blue-hour light rather " +
        "than firelight. Single subject, centred bust, plain dark background. No text, no " +
        "lettering, no frame, no watermark. Tasteful and non-graphic.",
    );
  });

  it("frames a cover in the same palette and under the same rules", () => {
    expect(HOUSE_COVER_STYLE.startsWith(HOUSE_PORTRAIT_STYLE.split(" Single subject")[0]!)).toBe(
      true,
    );
    expect(
      HOUSE_COVER_STYLE.endsWith(
        "No text, no lettering, no frame, no watermark. Tasteful and non-graphic.",
      ),
    ).toBe(true);
  });
});
