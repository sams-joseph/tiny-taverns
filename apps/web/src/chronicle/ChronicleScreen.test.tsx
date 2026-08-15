import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  installChronicleServer,
  renderChronicle,
  session11Id,
  session12Id,
} from "./chronicle.fixtures";

/**
 * The Chronicle against a stub server: the spine, one night open, the search,
 * and the states a real campaign puts it in.
 *
 * Installed once at module scope for the `Context.Reference` reason
 * `api/client.test.ts` records — a per-test `vi.stubGlobal("fetch")` would keep
 * serving the first test's answers with nothing to notice.
 */
const server = installChronicleServer();

beforeEach(() => {
  server.reset();
});

const requested = (fragment: string): boolean =>
  server.calls.some((call) => call.pathname.includes(fragment));

describe("the spine", () => {
  it("lists every night, newest first, and opens the newest", async () => {
    await renderChronicle();

    // By role, not by text: the campaign row's own badge says "Session 12"
    // too, because the Chronicle wears `CampaignChrome` like every other
    // campaign destination. The spine's nights are the buttons.
    await screen.findByRole("button", { name: /Session 12/ });
    expect(screen.getByRole("button", { name: /Session 11/ })).toBeInTheDocument();
    expect(await screen.findByText("2 nights on the record")).toBeInTheDocument();

    // Only the open card's recap is read. A collapsed row costs no request —
    // which is the whole reason a recap is loaded by the card that shows it.
    await waitFor(() => {
      expect(requested(`${session12Id}/recap`)).toBe(true);
    });
    expect(requested(`${session11Id}/recap`)).toBe(false);
  });

  it("reads a night's recap when its card is opened", async () => {
    await renderChronicle();
    await screen.findByText("Session 11");

    await userEvent.click(screen.getByRole("button", { name: /Session 11/ }));

    expect(await screen.findByText(/The ferryman is called Cazril/)).toBeInTheDocument();
    expect(requested(`${session11Id}/recap`)).toBe(true);
  });

  it("says where the record begins, without offering to import what is missing", async () => {
    await renderChronicle();
    expect(
      await screen.findByText(/The record starts at session 11\. Sessions 1–10 are not in it\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Import/)).not.toBeInTheDocument();
  });
});

/**
 * The assertion this screen exists to get right. `fight.test.ts` pins the
 * sentences; this pins that the screen renders the right one at each end.
 */
describe("a fight that carried across two nights", () => {
  it("names the round it paused on, on the night it paused", async () => {
    await renderChronicle();
    await screen.findByText("Session 11");
    await userEvent.click(screen.getByRole("button", { name: /Session 11/ }));

    expect(await screen.findByText("Paused at round 4 when the night ended.")).toBeInTheDocument();
    expect(
      screen.getByText("Session 12 picked it up, and it has reached round 7 there."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Paused at round 7/)).not.toBeInTheDocument();
  });

  it("names the same round, from the night that picked it up", async () => {
    await renderChronicle();

    expect(await screen.findByText("Resumed from round 4 of session 11.")).toBeInTheDocument();
    expect(screen.getByText("On the table now, at round 7.")).toBeInTheDocument();
    expect(screen.queryByText(/Resumed from round 7/)).not.toBeInTheDocument();
  });
});

describe("read aloud", () => {
  it("drops the DM-only half rather than restyling it", async () => {
    await renderChronicle();
    await screen.findByText("Session 11");
    await userEvent.click(screen.getByRole("button", { name: /Session 11/ }));
    await screen.findByText(/The ferryman is called Cazril/);
    expect(screen.getByText("At the table")).toBeInTheDocument();
    expect(screen.getByText("Threads still open")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Read aloud/ }));

    // The night's own prose stays; everything the DM alone needs is gone.
    expect(screen.getByText(/The ferryman is called Cazril/)).toBeInTheDocument();
    expect(screen.queryByText("At the table")).not.toBeInTheDocument();
    expect(screen.queryByText("Questions you answered")).not.toBeInTheDocument();
    expect(screen.queryByText("Threads still open")).not.toBeInTheDocument();
  });
});

describe("searching the record", () => {
  it("asks the server, and shows hits from more than one source", async () => {
    await renderChronicle();
    await screen.findByRole("button", { name: /Session 12/ });

    await userEvent.type(screen.getByLabelText("Search the record"), "ferryman");

    // The subtitle settles last, so waiting on it is waiting for the answer to
    // the whole query rather than to a prefix of it.
    await screen.findByText(/3 results for .*ferryman/);
    expect(screen.getByText("Beat")).toBeInTheDocument();
    expect(screen.getByText("Note")).toBeInTheDocument();
    expect(screen.getByText("Ferryman of the Reeds")).toBeInTheDocument();

    const call = server.calls.find((entry) => entry.pathname.endsWith("/search"));
    expect(call?.search).toContain("q=ferryman");
    // No `source` unless one is chosen: absence is what "everything" means.
    expect(call?.search).not.toContain("source=");
  });

  it("sends source as one scalar value, never as a list", async () => {
    await renderChronicle();
    await screen.findByRole("button", { name: /Session 12/ });
    await userEvent.type(screen.getByLabelText("Search the record"), "ferryman");
    await screen.findByText("Beat");

    // Base UI's select is keyboard-driven; a synthesised click on an option
    // does not land. Same route the runner's tests take.
    const trigger = screen.getByLabelText("Search in");
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    const option = await screen.findByRole("option", { name: "Beats" });
    await userEvent.click(option);

    await waitFor(() => {
      const scoped = server.calls.filter(
        (entry) => entry.pathname.endsWith("/search") && entry.search.includes("source="),
      );
      expect(scoped.length).toBeGreaterThan(0);
      // One occurrence, one value. A `Schema.Array` here would encode
      // `?source=beat` too and then refuse to decode it — see `search.ts`.
      expect(scoped.at(-1)?.search.match(/source=/g)).toHaveLength(1);
      expect(scoped.at(-1)?.search).toContain("source=beat");
    });
  });

  it("renders an excerpt as text, never as markup", async () => {
    await renderChronicle();
    await screen.findByRole("button", { name: /Session 12/ });
    await userEvent.type(screen.getByLabelText("Search the record"), "ferryman");

    // The note hit's snippet carries `<b>…</b>`. The API promises plain text, so
    // those characters must be on screen and no element may have been made.
    const excerpt = await screen.findByText(/waits/);
    expect(excerpt.textContent).toContain("<b>waits</b>");
    expect(excerpt.querySelector("b")).toBeNull();
  });

  it("says nothing matches, and says what to do about it", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/search`, { status: 200, body: [] });
    await renderChronicle();
    await screen.findByRole("button", { name: /Session 12/ });

    await userEvent.type(screen.getByLabelText("Search the record"), "quokka");

    await screen.findByText(/0 results for .*quokka/);
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
    expect(screen.getByText(/notes, beats or bestiary/)).toBeInTheDocument();
  });

  it("opens the night a beat came from", async () => {
    await renderChronicle();
    await screen.findByRole("button", { name: /Session 12/ });
    await userEvent.type(screen.getByLabelText("Search the record"), "ferryman");

    const beatHit = (await screen.findByText("Beat")).closest("li");
    expect(beatHit).not.toBeNull();
    await userEvent.click(
      within(beatHit as HTMLElement).getByRole("button", { name: /Read that night/ }),
    );

    expect(await screen.findByText(/The ferryman is called Cazril/)).toBeInTheDocument();
  });
});

describe("a campaign with no history at all", () => {
  it("is the state a new DM sees first, and it says what fills it", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/sessions`, { status: 200, body: [] });
    server.routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: {
        ...JSON.parse(JSON.stringify(server.routes.get(`GET /campaigns/${campaignId}`)?.body)),
        currentSessionId: null,
      },
    });
    await renderChronicle();

    expect(await screen.findByText("Nothing written down yet")).toBeInTheDocument();
    expect(screen.getByText(/every beat you jot/)).toBeInTheDocument();
    expect(screen.getByText("0 nights on the record")).toBeInTheDocument();
    // No spine terminus over an empty spine, and no aside reading a night that
    // does not exist.
    expect(screen.queryByText(/The record starts at/)).not.toBeInTheDocument();
    expect(screen.queryByText("Threads still open")).not.toBeInTheDocument();
  });
});

describe("when the load fails", () => {
  it("says so plainly, with a way to try again", async () => {
    server.routes.delete(`GET /campaigns/${campaignId}`);
    await renderChronicle();

    expect(await screen.findByRole("alert")).toHaveTextContent("Not here");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("threads still open", () => {
  it("reads the unticked half of the current night's checklist, and names the night", async () => {
    await renderChronicle();

    expect(await screen.findByText("Threads still open")).toBeInTheDocument();
    expect(screen.getByText("Decide what Ovid thinks is in the crate")).toBeInTheDocument();
    expect(screen.getByText(/Unticked on session 12/)).toBeInTheDocument();
  });
});
