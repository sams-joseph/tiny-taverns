/**
 * The one house style every Hob-drawn image is made in: the inked, firelit
 * direction the maintainer chose on 2026-10-17, the look the board's effects
 * share (`apps/web/src/run/fx/`). It supersedes the design delivery's
 * provisional imagery note (`packages/design-system/readme.md`, *Imagery*:
 * "blue-hour rather than firelight", which it calls a recommendation) until a
 * delivery answers it. The words describe the look's qualities and name no
 * game or studio, so a model draws the qualities rather than imitating a work.
 *
 * **One style, four framings.** The palette and the rules are the same words for
 * every kind of image; what differs is only the framing the place it shows
 * needs — a bust on a plate for a character or an NPC, the same figure across a
 * card's wide band, a wide scene under a card for a campaign or a Shared World,
 * and a whole place seen from above for a realm's, a region's or a town's map.
 * Each framing is a whole style string, so a prompt builder appends
 * one constant and never assembles the style itself.
 */

/** The look: inked and painterly, saturated colour over deep shadow, carved out by warm firelight. */
const HOUSE_PALETTE =
  "Painterly fantasy illustration with a bold comic-book finish: confident dark ink outlines on every " +
  "form, flat saturated colour, dramatic chiaroscuro. Warm firelight and a hard rim of light carve the " +
  "subject out of deep near-black shadow; ember orange, blood red and burnished gold against cool " +
  "violet and teal shade.";

/** What no image may carry, whatever it shows. */
const HOUSE_RULES = "No text, no lettering, no frame, no watermark. Tasteful and non-graphic.";

/** A character's or an NPC's portrait: one figure on a plate that crops to the head. */
export const HOUSE_PORTRAIT_STYLE = `${HOUSE_PALETTE} Single subject, centred bust, plain dark background. ${HOUSE_RULES}`;

/**
 * A character's or an NPC's banner: the same figure as the portrait, framed
 * for a card's wide portrait band rather than a square plate. The picture is
 * drawn at 3:2 and cut to 2:1 through its middle (`kinds.ts`), so the head is
 * asked for inside the middle band and the setting carries the width.
 */
export const HOUSE_BANNER_STYLE = `${HOUSE_PALETTE} Single subject, a wide banner composition: the figure from the chest up in the centre of a wide frame, the whole head well inside the middle band of the picture with room above it, and a quiet, dim setting that suits them running out to the left and right edges instead of a plain background. Nothing important near the top or bottom edge. ${HOUSE_RULES}`;

/**
 * A cover: a wide scene that reads behind a card's title, so nobody's face is
 * the subject and nothing important sits at the edges a crop may lose.
 */
export const HOUSE_COVER_STYLE = `${HOUSE_PALETTE} Wide landscape composition, a place rather than a portrait, no figure in close-up, the subject kept away from the edges. ${HOUSE_RULES}`;

/**
 * A place's map: a realm, a region, a settlement or a dungeon seen from
 * directly above at the scale of the whole place, like a page of an atlas —
 * not a fight's board. The app pins the places inside it over the picture, so
 * nothing is labelled and the places that matter are left room.
 */
export const HOUSE_ATLAS_STYLE = `${HOUSE_PALETTE} An illustrated map of the whole place seen from directly overhead, like a page of a hand-inked atlas: no perspective, no horizon, no sky. Terrain, water, roads and buildings drawn at the scale of the place, clearly told apart. No labels, no names, no compass rose, no legend, no border, no grid. No people, no creatures. Distinct sites spread across the picture with open ground around them, nothing important at the very edges. ${HOUSE_RULES}`;
