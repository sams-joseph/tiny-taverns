import { describe, expect, it } from "vitest";
import { CAMPAIGN_DESCRIPTION_MAX } from "./Campaign.js";
import { campaignImageHasSubject, campaignImagePromptFor } from "./CampaignImage.js";
import { HOUSE_COVER_STYLE, HOUSE_PORTRAIT_STYLE } from "./HouseStyle.js";

const style = { style: HOUSE_COVER_STYLE };

describe("campaignImagePromptFor", () => {
  it("asks for the place the name suggests, in the house style framed as a cover", () => {
    const prompt = campaignImagePromptFor(
      { name: "The Salt Road", partyName: null, description: null },
      style,
    );
    expect(prompt).toBe(
      "Wide establishing scene for a fantasy adventure called The Salt Road: the place and " +
        "the mood that title suggests, shown rather than written. " +
        HOUSE_COVER_STYLE,
    );
  });

  it("names the party when the table has given it one", () => {
    const prompt = campaignImagePromptFor(
      { name: "The Salt Road", partyName: "The Iron Crows", description: null },
      style,
    );
    expect(prompt).toContain("known as The Iron Crows");
    expect(prompt.endsWith(HOUSE_COVER_STYLE)).toBe(true);
  });

  it("draws the description first, as the scene, with the name only colouring it", () => {
    const prompt = campaignImagePromptFor(
      {
        name: "The Salt Road",
        partyName: "The Iron Crows",
        description: "A caravan route across white salt flats, haunted by glass storms",
      },
      style,
    );
    expect(prompt).toBe(
      "Wide establishing scene for a fantasy adventure. A caravan route across white salt " +
        "flats, haunted by glass storms. The adventure is called The Salt Road; let that " +
        "colour the mood, shown rather than written. The adventuring party at its heart is " +
        "known as The Iron Crows; hint at them, small in the scene. " +
        HOUSE_COVER_STYLE,
    );
  });

  it("treats a blank description as none, and bounds a long one at the schema's limit", () => {
    const blank = campaignImagePromptFor(
      { name: "The Salt Road", partyName: null, description: "  “”  " },
      style,
    );
    expect(blank).toBe(
      campaignImagePromptFor({ name: "The Salt Road", partyName: null, description: null }, style),
    );
    const long = campaignImagePromptFor(
      {
        name: "Rime",
        partyName: null,
        description: `"${"y".repeat(CAMPAIGN_DESCRIPTION_MAX + 50)}"`,
      },
      style,
    );
    expect(long).toContain("y".repeat(CAMPAIGN_DESCRIPTION_MAX));
    expect(long).not.toContain("y".repeat(CAMPAIGN_DESCRIPTION_MAX + 1));
    expect(long).not.toContain('"');
  });

  it("strips quotes and runs of space, and bounds each label", () => {
    const prompt = campaignImagePromptFor(
      { name: `  "The   Drowned\nKing"  `, partyName: "x".repeat(400), description: null },
      style,
    );
    expect(prompt).toContain("called The Drowned King:");
    expect(prompt).not.toContain('"');
    expect(prompt).not.toContain("x".repeat(121));
  });
});

describe("campaignImageHasSubject", () => {
  it("draws from a description alone", () => {
    const campaign = { name: " ", partyName: null, description: "Fog over a drowned city." };
    expect(campaignImageHasSubject(campaign)).toBe(true);
    expect(campaignImagePromptFor(campaign, style)).toBe(
      "Wide establishing scene for a fantasy adventure. Fog over a drowned city. " +
        HOUSE_COVER_STYLE,
    );
  });

  it("draws any campaign with a name, and skips one named in nothing but space and quotes", () => {
    expect(campaignImageHasSubject({ name: "Rime", partyName: null, description: null })).toBe(
      true,
    );
    expect(
      campaignImageHasSubject({ name: "  “” ", partyName: "The Crows", description: null }),
    ).toBe(false);
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
