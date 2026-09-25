import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { renderAt } from "../test/renderRoute";
import {
  bargainId,
  bridgeId,
  campaignId,
  encounterShelf,
  installStubServer,
  liveRun,
  mintingSession,
  page,
  playedRunId,
  playedSessionId,
  readAloud,
  renderEncounters,
  renderScreen,
  sessionId,
  sketchId,
  stormId,
  wellId,
} from "./campaign.fixtures";

/**
 * The Encounters page as the redesign draws it: the kind pills, the groups,
 * the selection held in the URL, and a preview that draws only what the
 * selected encounter has. Read over `encounterShelf` — an encounter of every
 * kind, two of them played — on top of the campaign's own wire.
 */

const server = installStubServer();
const base = `/campaigns/${campaignId}`;
const encountersPath = `${base}/encounters`;

const shelve = () => {
  for (const [route, answer] of encounterShelf()) server.routes.set(route, answer);
};

beforeEach(() => {
  server.reset();
  shelve();
});

const pill = (name: RegExp) => screen.getByRole("button", { name });
const preview = () => screen.getByRole("article");
const rowFor = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
/** The group headings, in the order drawn. */
const groups = () =>
  screen
    .getAllByRole("heading", { level: 2 })
    .map((heading) => heading.textContent)
    .filter((text) => text !== null && /table now|yet played|^Played$/.test(text));

const chosen = () => new URLSearchParams(globalThis.location.search).get("encounter");

describe("the Encounters page", () => {
  it("counts every kind on its pill and says where the encounters stand", async () => {
    await renderEncounters(mintingSession());
    await screen.findByRole("article");

    expect(pill(/^All/)).toHaveTextContent("All7");
    expect(pill(/^Combat/)).toHaveTextContent("Combat3");
    expect(pill(/^Social/)).toHaveTextContent("Social2");
    expect(pill(/^Challenges & hazards/)).toHaveTextContent("Challenges & hazards2");
    expect(pill(/^All/)).toHaveAttribute("aria-pressed", "true");
    // No search box: the pills are the filter.
    expect(screen.queryByRole("combobox", { name: "Search encounters" })).toBeNull();

    expect(screen.getByText("5 not yet played · 2 played")).toBeInTheDocument();
    expect(groups()).toEqual(["Not yet played", "Played"]);
  });

  it("puts the fight on the table in a group of its own, first", async () => {
    server.routes.set(`GET ${base}/sessions/${sessionId}/runs`, { status: 200, body: [liveRun] });
    await renderEncounters(mintingSession());
    await screen.findByRole("article");

    expect(screen.getByText("1 on the table · 4 not yet played · 2 played")).toBeInTheDocument();
    expect(groups()).toEqual(["On the table now", "Not yet played", "Played"]);
    // The live one leads, so it is the one previewed, and Run goes back to it.
    expect(preview()).toHaveAccessibleName("Ambush in the reeds");
    expect(within(preview()).getByText("Combat · On the table now")).toBeInTheDocument();
    expect(
      within(preview()).getByRole("button", { name: "Back to the fight" }),
    ).toBeInTheDocument();
  });

  it("draws each row as its kind and rating, with its count, sharing and when it was played", async () => {
    await renderEncounters(mintingSession());
    await screen.findByRole("article");

    expect(rowFor("Ambush in the reeds")).toHaveTextContent("Combat·Medium·6 creatures");
    expect(within(rowFor("Ambush in the reeds")).getByText("Medium")).toHaveClass("text-info-ink");
    expect(rowFor("Whatever is in the crate")).toHaveTextContent("Combat·Unrated·1 creature");
    expect(rowFor("The dry well")).toHaveTextContent("Challenge·DC 14");
    expect(rowFor("Salt-flat sandstorm")).toHaveTextContent("Hazard·Hazard");
    expect(rowFor("The hag's bargain")).toHaveTextContent("Social·Hard·3 creatures");
    expect(within(rowFor("The hag's bargain")).getByText("Shared")).toBeInTheDocument();
    expect(rowFor("Toll bridge standoff")).toHaveTextContent("Social·No combat");
    expect(rowFor("Toll bridge standoff")).toHaveTextContent("Played · Session 11");
    // The drawing's Ready and Draft have nothing behind them.
    expect(screen.queryByText(/^(Ready|Draft)$/)).toBeNull();
    // A row selects; it carries no Edit or Run of its own.
    expect(screen.queryByRole("button", { name: /^(Edit|Run) Ambush/ })).toBeNull();
  });

  it("previews the first encounter until one is chosen, and keeps the choice in the URL", async () => {
    await renderEncounters(mintingSession());
    await screen.findByRole("article");
    expect(preview()).toHaveAccessibleName("Ambush in the reeds");
    expect(rowFor("Ambush in the reeds")).toHaveAttribute("aria-current", "true");
    expect(chosen()).toBeNull();

    await userEvent.click(rowFor("The dry well"));

    await waitFor(() => expect(preview()).toHaveAccessibleName("The dry well"));
    expect(chosen()).toBe(wellId);
    expect(rowFor("The dry well")).toHaveAttribute("aria-current", "true");
    expect(rowFor("Ambush in the reeds")).not.toHaveAttribute("aria-current");
  });

  it("opens on the encounter a link names", async () => {
    await renderAt(`${encountersPath}?encounter=${bargainId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("The hag's bargain"));
  });

  it("falls back to the first shown when the pill hides the choice", async () => {
    await renderAt(`${encountersPath}?encounter=${bargainId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("The hag's bargain"));

    await userEvent.click(pill(/^Challenges & hazards/));

    await waitFor(() => expect(preview()).toHaveAccessibleName("The dry well"));
    expect(chosen()).toBeNull();
    expect(screen.queryByRole("button", { name: /^Ambush/ })).toBeNull();
    expect(pill(/^Challenges & hazards/)).toHaveAttribute("aria-pressed", "true");

    // A choice the pill still shows survives it.
    await userEvent.click(rowFor("Salt-flat sandstorm"));
    await waitFor(() => expect(chosen()).toBe(stormId));
    await userEvent.click(pill(/^All/));
    expect(preview()).toHaveAccessibleName("Salt-flat sandstorm");
    expect(chosen()).toBe(stormId);
  });
});

describe("the preview", () => {
  it("draws a fight whole: where, difficulty, read-aloud, creatures, tactics and treasure", async () => {
    await renderEncounters(mintingSession());
    const pane = await screen.findByRole("article");

    expect(within(pane).getByText("Combat · Not yet played")).toBeInTheDocument();
    expect(await within(pane).findByText("A boardwalk over black water")).toBeInTheDocument();

    const difficulty = within(pane).getByRole("region", { name: "Difficulty" });
    const band = difficulty.querySelector("[data-slot=difficulty-band]");
    expect(band).toHaveTextContent("Medium");
    expect(band).toHaveClass("text-info-ink");
    expect(within(difficulty).getByText("2,400 adj. XP · party of 4, lvl 5")).toBeInTheDocument();
    // The mark sits on the party's own scale: 2,400 of 4,400 × 1.25.
    const mark = pane.querySelector<HTMLElement>("[data-slot=difficulty-mark]");
    expect(mark?.style.left).toBe("43.6%");

    expect(within(pane).getByText(readAloud.body)).toHaveClass("font-serif", "italic");

    const table = within(pane).getByRole("table");
    const [, row] = within(table).getAllByRole("row");
    expect(within(row!).getByRole("rowheader")).toHaveTextContent("Goblin Boss");
    expect(row).toHaveTextContent("×6");
    expect(row).toHaveTextContent("1,200");

    const tactics = within(pane).getByRole("region", { name: "Running it" });
    expect(within(tactics).getAllByRole("listitem")).toHaveLength(2);
    expect(within(pane).getByRole("region", { name: "Treasure" })).toHaveTextContent(
      "28 sp and a bone whistle",
    );
    expect(within(pane).getByRole("button", { name: "Run encounter" })).toBeInTheDocument();
  });

  it("says why an encounter is unrated, and dashes the XP nobody wrote", async () => {
    await renderAt(`${encountersPath}?encounter=${sketchId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Whatever is in the crate"));
    const pane = preview();

    const difficulty = within(pane).getByRole("region", { name: "Difficulty" });
    expect(difficulty.querySelector("[data-slot=difficulty-band]")).toHaveTextContent("Unrated");
    expect(within(difficulty).getByText("A creature on the roster has no XP")).toBeInTheDocument();
    expect(pane.querySelector("[data-slot=difficulty-meter]")).toBeNull();

    const table = await within(pane).findByRole("table");
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("—");
    // Nothing was written for it, so none of those sections is drawn.
    expect(within(pane).queryByRole("region", { name: "Running it" })).toBeNull();
    expect(within(pane).queryByRole("region", { name: "Treasure" })).toBeNull();
    expect(within(pane).queryByRole("region", { name: "Read aloud" })).toBeNull();
  });

  it("draws a skill challenge by its numbers, with no difficulty or creatures", async () => {
    await renderAt(`${encountersPath}?encounter=${wellId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("The dry well"));
    const pane = preview();
    await waitFor(() => expect(within(pane).queryByRole("status")).toBeNull());

    const challenge = within(pane).getByRole("region", { name: "Challenge" });
    expect(within(challenge).getByText("DC").nextElementSibling).toHaveTextContent("14");
    expect(within(challenge).getByText("Successes").nextElementSibling).toHaveTextContent("3");
    expect(within(challenge).getByText("Failures").nextElementSibling).toHaveTextContent("2");
    expect(within(challenge).getByText("Investigation")).toBeInTheDocument();
    expect(within(pane).queryByRole("region", { name: "Difficulty" })).toBeNull();
    expect(within(pane).queryByRole("region", { name: "Creatures" })).toBeNull();
    expect(within(pane).queryByRole("table")).toBeNull();
    // No setting line on its map, so no where line.
    expect(pane.querySelector("header p")).toBeNull();
  });

  it("draws a hazard by its save", async () => {
    await renderAt(`${encountersPath}?encounter=${stormId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Salt-flat sandstorm"));

    const hazard = within(preview()).getByRole("region", { name: "Hazard" });
    expect(within(hazard).getByText("Save").nextElementSibling).toHaveTextContent("CON 13");
    expect(within(hazard).getByText("On fail").nextElementSibling).toHaveTextContent(
      "1 level of exhaustion",
    );
    expect(within(hazard).getByText("Duration").nextElementSibling).toHaveTextContent("1d4 hours");
    expect(within(hazard).getByText("Animal Handling")).toBeInTheDocument();
  });

  it("offers a played encounter's log, and keeps its tactics the DM's plan", async () => {
    await renderAt(`${encountersPath}?encounter=${bridgeId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Toll bridge standoff"));
    const pane = preview();

    expect(within(pane).getByText("Social · Played · Session 11")).toBeInTheDocument();
    expect(within(pane).getByRole("button", { name: "View log" })).toHaveAttribute(
      "href",
      `${base}/sessions/${playedSessionId}/runs/${playedRunId}`,
    );
    expect(within(pane).queryByRole("button", { name: "Run encounter" })).toBeNull();
    expect(within(pane).getByRole("region", { name: "Running it" })).toBeInTheDocument();
    expect(within(pane).queryByText("What happened")).toBeNull();
  });

  it("edits the encounter it shows, and adds creatures through the same form", async () => {
    await renderAt(`${encountersPath}?encounter=${bargainId}`);
    await waitFor(() => expect(preview()).toHaveAccessibleName("The hag's bargain"));

    await userEvent.click(within(preview()).getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("The hag's bargain");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(within(preview()).getByRole("button", { name: "Add creature" }));
    expect(await screen.findByRole("textbox", { name: "Name" })).toHaveValue("The hag's bargain");
  });

  it("puts the encounter on the table through the campaign's own run", async () => {
    await renderEncounters(mintingSession());
    await screen.findByRole("article");

    await userEvent.click(within(preview()).getByRole("button", { name: "Run encounter" }));

    expect(await screen.findByText("Put an encounter on the table")).toBeInTheDocument();
    expect(screen.getByText(/This runs in session 12/)).toBeInTheDocument();
  });
});

describe("with nothing to show", () => {
  it("says there are no encounters, with no pills and no preview", async () => {
    server.routes.set(`GET ${encountersPath}`, { status: 200, body: page([]) });
    server.routes.set(`GET ${base}/encounter-prep`, { status: 200, body: [] });
    await renderEncounters(mintingSession());

    expect(await screen.findByText("No encounters yet")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("button", { name: /^All/ })).toBeNull();
  });

  it("says a pill matches nothing, rather than that there is nothing", async () => {
    server.reset();
    await renderEncounters(mintingSession());
    await screen.findByRole("article");

    await userEvent.click(pill(/^Social/));

    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    expect(screen.queryByRole("article")).toBeNull();
    expect(pill(/^Social/)).toHaveTextContent("Social0");
  });
});

describe("the Overview's encounter rows", () => {
  it("open the Encounters tab with that encounter selected", async () => {
    server.reset();
    await renderScreen(mintingSession());
    const card = (await screen.findByText("Next session")).closest("[data-slot=card]");
    const rows = within(card as HTMLElement).getAllByRole("listitem");

    await userEvent.click(within(rows[1]!).getByRole("link", { name: "Whatever is in the crate" }));

    await waitFor(() => expect(globalThis.location.pathname).toBe(encountersPath));
    expect(chosen()).toBe(sketchId);
    await waitFor(() => expect(preview()).toHaveAccessibleName("Whatever is in the crate"));
    expect(rowFor("Whatever is in the crate")).toHaveAttribute("aria-current", "true");
  });
});
