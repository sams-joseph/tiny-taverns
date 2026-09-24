/**
 * The one house style every Hob-drawn image is made in, from the design
 * delivery's imagery direction (`packages/design-system/readme.md`, *Imagery*).
 *
 * **One style, three framings.** The palette and the rules are the same words for
 * every kind of image; what differs is only the framing the place it shows
 * needs — a bust on a plate for a character or an NPC, a wide scene under a
 * card for a campaign or a Shared World, a board seen from above for an
 * encounter's battle map. Each framing is a whole style string, so a prompt builder appends
 * one constant and never assembles the style itself.
 */

/** The look: the delivery's *cool, low-key, slight grain, blue-hour rather than firelight*. */
const HOUSE_PALETTE =
  "Fantasy illustration somewhat cartoony think World of Warcraft from Blizzard, cool and low-key, slight grain, blue-hour light rather " +
  "than firelight.";

/** What no image may carry, whatever it shows. */
const HOUSE_RULES = "No text, no lettering, no frame, no watermark. Tasteful and non-graphic.";

/** A character's or an NPC's portrait: one figure on a plate that crops to the head. */
export const HOUSE_PORTRAIT_STYLE = `${HOUSE_PALETTE} Single subject, centred bust, plain dark background. ${HOUSE_RULES}`;

/**
 * A cover: a wide scene that reads behind a card's title, so nobody's face is
 * the subject and nothing important sits at the edges a crop may lose.
 */
export const HOUSE_COVER_STYLE = `${HOUSE_PALETTE} Wide landscape composition, a place rather than a portrait, no figure in close-up, the subject kept away from the edges. ${HOUSE_RULES}`;

/**
 * A battle map: the ground a fight is played on, seen from straight above, with
 * nothing on it. **No grid in the picture** — the model cannot hold a precise
 * one, so the app lays its own over the picture and lines it up — and no
 * creatures, because the tokens are the pieces and a painted goblin is one the
 * DM cannot move.
 */
export const HOUSE_MAP_STYLE = `${HOUSE_PALETTE} A top-down view from directly overhead, flat like a floor plan: no perspective, no horizon, no sky. No grid, no grid lines, no squares marked on the ground. No people, no creatures, no tokens: the ground is empty and ready for play. Even, readable light; walls, obstacles and open ground clearly told apart, the playable ground running to the edges. ${HOUSE_RULES}`;
