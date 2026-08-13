import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  installPlayerChronicleServer,
  renderPlayerChronicle,
  session11Id,
  session12Id,
} from "./player.fixtures";

/**
 * The player's Chronicle against a stub server.
 *
 * Two properties are worth more than the rest and both are pinned here: **the
 * screen reads the narrow endpoint and only the narrow endpoint**, and **a
 * carried fight's two rounds still mean what they mean.** The first is what
 * makes a mistake on this screen a blank page rather than a disclosure; the
 * second is the number the DM's Chronicle already gets right and that a second
 * projection could quietly lose.
 */
const server = installPlayerChronicleServer();

beforeEach(() => {
  server.reset();
});

const paths = (): ReadonlyArray<string> => server.calls.map((call) => call.pathname);

describe("what it reads", () => {
  it("asks for the player's recap and never for the DM's", async () => {
    renderPlayerChronicle();
    await screen.findByText("Session 12");

    await waitFor(() => {
      expect(paths()).toContain(`/campaigns/${campaignId}/sessions/${session12Id}/recap/player`);
    });

    // The DM's is `…/recap` exactly, and it is behind the `DmActor` gate. A
    // suffix test rather than a substring one: `…/recap/player` contains it.
    expect(paths().some((path) => path.endsWith("/recap"))).toBe(false);
    // No checklist either — "Threads still open" is the DM's own prep.
    expect(paths().some((path) => path.endsWith("/prep"))).toBe(false);
    // And no search: the box is not drawn, so nothing asks.
    expect(paths().some((path) => path.endsWith("/search"))).toBe(false);
  });

  it("costs one recap, not one per night", async () => {
    renderPlayerChronicle();
    await screen.findByText("Session 11");

    await waitFor(() => {
      expect(paths()).toContain(`/campaigns/${campaignId}/sessions/${session12Id}/recap/player`);
    });
    // A collapsed row reads nothing — the property `load.ts` exists to keep,
    // and it survives the spine being shared with the DM's screen.
    expect(paths()).not.toContain(`/campaigns/${campaignId}/sessions/${session11Id}/recap/player`);

    await userEvent.click(screen.getByRole("button", { name: /Session 11/ }));
    await waitFor(() => {
      expect(paths()).toContain(`/campaigns/${campaignId}/sessions/${session11Id}/recap/player`);
    });
  });
});

/**
 * The assertion the whole player projection exists for. `PlayerRecap.ts` leaves
 * armour class off the type rather than nullable — this is that decision seen
 * from the screen.
 */
describe("a fight, as a player is told it", () => {
  it("bands the monsters and gives the party their exact hit points", async () => {
    renderPlayerChronicle();
    await screen.findByText("Session 11");
    await userEvent.click(screen.getByRole("button", { name: /Session 11/ }));

    // Somebody at the table: the number everybody already says out loud.
    expect(await screen.findByText("6/52 hp")).toBeInTheDocument();

    // What the DM was running: three words, and no number anywhere.
    expect(screen.getByText("Bloodied")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByText("Marsh Hag")).toBeInTheDocument();
    expect(screen.getByText("Legendary")).toBeInTheDocument();

    // The two numbers the fixture's monster would have carried on the DM's
    // read: 82 hit points and armour class 17. Neither is on the wire, so
    // neither can be on the screen.
    expect(screen.queryByText(/82/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bAC\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/17/)).not.toBeInTheDocument();
  });

  it("counts who ended it down from the band, not from a number it does not have", async () => {
    renderPlayerChronicle();
    await screen.findByText("Session 11");
    await userEvent.click(screen.getByRole("button", { name: /Session 11/ }));

    // Three in the fight; the Reed Stalker is `down` and Brannoc is at 6.
    expect(await screen.findByText("3 in initiative, 1 down.")).toBeInTheDocument();
  });

  it("says so when the DM shared the fight but nobody in it", async () => {
    renderPlayerChronicle();
    // Session 12's fight has no combatants a player may see.
    expect(await screen.findByText("Your DM did not share who was in it.")).toBeInTheDocument();
  });
});

/**
 * The requirement in the brief, and the reason `fightStory` is shared: the DM's
 * Chronicle already renders these two sentences the right way round, and the
 * player's must not lose it. The fixture's rounds differ (paused at 4, since
 * reached 7), which is the only way this says anything.
 */
describe("a fight that carried across two nights", () => {
  it("names the round it paused on, on the night it paused", async () => {
    renderPlayerChronicle();
    await screen.findByText("Session 11");
    await userEvent.click(screen.getByRole("button", { name: /Session 11/ }));

    expect(await screen.findByText("Paused at round 4 when the night ended.")).toBeInTheDocument();
    expect(
      screen.getByText("Session 12 picked it up, and it has reached round 7 there."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Paused at round 7/)).not.toBeInTheDocument();
  });

  it("names the same round, from the night that picked it up", async () => {
    renderPlayerChronicle();

    expect(await screen.findByText("Resumed from round 4 of session 11.")).toBeInTheDocument();
    expect(screen.getByText("On the table now, at round 7.")).toBeInTheDocument();
    expect(screen.queryByText(/Resumed from round 7/)).not.toBeInTheDocument();
  });
});

describe("read aloud", () => {
  it("drops the fights and keeps the night's prose", async () => {
    renderPlayerChronicle();
    await screen.findByText("Session 11");
    await userEvent.click(screen.getByRole("button", { name: /Session 11/ }));
    await screen.findByText(/The ferryman is called Cazril/);
    expect(screen.getAllByText("At the table").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: /Read aloud/ }));

    expect(screen.getByText(/The ferryman is called Cazril/)).toBeInTheDocument();
    expect(screen.queryByText("At the table")).not.toBeInTheDocument();
    expect(screen.queryByText("6/52 hp")).not.toBeInTheDocument();
    expect(screen.queryByText("Bloodied")).not.toBeInTheDocument();
  });
});

describe("a table that has shared nothing", () => {
  it("is what a player who joined last night sees, and it names who decides", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/sessions`, { status: 200, body: [] });
    renderPlayerChronicle();

    expect(await screen.findByText("No nights shared yet")).toBeInTheDocument();
    expect(screen.getByText(/Your DM decides which nights/)).toBeInTheDocument();
    expect(screen.getByText("0 nights your DM has shared")).toBeInTheDocument();
    // No spine terminus over an empty spine.
    expect(screen.queryByText(/earliest night shared/)).not.toBeInTheDocument();
  });

  it("says where the shared record begins without claiming the rest was never played", async () => {
    renderPlayerChronicle();

    expect(
      await screen.findByText("The earliest night shared with you is session 11."),
    ).toBeInTheDocument();
    // The DM's screen says sessions 1–10 "are not in it". A player cannot tell
    // an unplayed night from an unshared one, so it does not say.
    expect(screen.queryByText(/are not in it/)).not.toBeInTheDocument();
  });
});

describe("when the load fails", () => {
  it("says so plainly, with a way to try again", async () => {
    server.routes.delete(`GET /campaigns/${campaignId}`);
    renderPlayerChronicle();

    expect(await screen.findByRole("alert")).toHaveTextContent("Not here");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
