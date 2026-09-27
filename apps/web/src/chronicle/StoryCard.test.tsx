import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignId,
  installChronicleServer,
  keptStory,
  renderChronicle,
} from "./chronicle.fixtures";

/**
 * The DM's *Story so far* at the head of the Chronicle: Hob's draft asked for
 * from the card, the kept story with its *Previously*, *Update needed* once a
 * newer night has ended, and the three writes that are the DM's own — edit,
 * share and clear.
 *
 * The fixture's session 11 has ended and session 12 is still running, so a
 * story written after 11 is current and one written after 10 is behind.
 */
const server = installChronicleServer();

beforeEach(() => {
  server.reset();
});

const storyPath = `/campaigns/${campaignId}/story`;

const story = (afterSessionNumber: number, visibility: "dm" | "shared" = "dm") => ({
  ...keptStory,
  afterSessionNumber,
  visibility,
});

const keep = (body: ReturnType<typeof story>): void => {
  server.routes.set(`GET ${storyPath}`, { status: 200, body });
  server.routes.set(`PUT ${storyPath}`, { status: 200, body });
  server.routes.set(`DELETE ${storyPath}`, { status: 204, body: null });
};

const card = (): Promise<HTMLElement> => screen.findByRole("region", { name: "The story so far" });

/** The card once the kept story has been read, rather than while it loads. */
const keptCard = async (): Promise<HTMLElement> => {
  await screen.findByText(story(0).text);
  return card();
};

const sent = (method: string): ReadonlyArray<unknown> =>
  server.calls
    .filter((call) => call.method === method && call.pathname === storyPath)
    .map((call) => call.body);

const reads = (): number =>
  server.calls.filter((call) => call.method === "GET" && call.pathname === storyPath).length;

describe("before a story is kept", () => {
  it("offers Hob's draft, and asking opens the panel with the question already sent", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/hob/threads`, { status: 200, body: [] });
    await renderChronicle();

    const story = await card();
    expect(await within(story).findByText(/No story kept yet/)).toBeInTheDocument();
    // Nothing to share, edit or clear until something is kept.
    expect(within(story).queryByRole("switch")).toBeNull();
    expect(within(story).queryByRole("button", { name: "Edit" })).toBeNull();

    await userEvent.click(within(story).getByRole("button", { name: "Ask Hob to draft" }));

    await waitFor(() => {
      const ask = server.calls.find(
        (call) => call.method === "POST" && call.pathname.endsWith("/hob/ask"),
      );
      expect(ask).toBeDefined();
      expect((ask!.body as { text: string }).text).toMatch(/Draft the story so far/);
    });
    // Asking writes nothing: only the DM's *Keep* in the panel does.
    expect(sent("PUT")).toEqual([]);
  });
});

describe("with no model behind Hob", () => {
  it("offers no draft to ask for", async () => {
    server.routes.set(`GET /campaigns/${campaignId}/hob`, {
      status: 200,
      body: { available: false, model: null, campaign: "The Salt Road" },
    });
    await renderChronicle();

    const story = await card();
    expect(within(story).getByText(/No story kept yet/)).toBeInTheDocument();
    expect(within(story).queryByRole("button", { name: "Ask Hob to draft" })).toBeNull();
  });
});

describe("a kept story", () => {
  it("reads the story and the Previously that opens the next night", async () => {
    keep(story(11));
    await renderChronicle();
    const kept = await keptCard();

    expect(within(kept).getByText(story(11).text)).toBeInTheDocument();
    expect(within(kept).getByText("Updated after session 11")).toBeInTheDocument();
    expect(within(kept).getByText("Previously, to open session 12")).toBeInTheDocument();
    expect(within(kept).getByText(story(11).previously)).toBeInTheDocument();
    expect(within(kept).queryByText("Update needed")).toBeNull();
    expect(within(kept).queryByRole("button", { name: "Ask Hob to update" })).toBeNull();
  });

  it("says it needs updating once a newer night has ended, and drops its Previously", async () => {
    keep(story(10));
    await renderChronicle();
    const kept = await keptCard();

    expect(within(kept).getByText("Update needed")).toBeInTheDocument();
    expect(within(kept).getByText(story(10).text)).toBeInTheDocument();
    expect(within(kept).queryByText(story(10).previously)).toBeNull();
    expect(within(kept).getByRole("button", { name: "Ask Hob to update" })).toBeInTheDocument();
  });

  it("starts unshared, and the switch shares the same words", async () => {
    keep(story(11));
    await renderChronicle();
    const kept = await keptCard();
    const toggle = within(kept).getByRole("switch");
    expect(toggle).not.toBeChecked();
    const before = reads();

    await userEvent.click(toggle);

    await waitFor(() => {
      expect(sent("PUT")).toEqual([
        { text: story(11).text, previously: story(11).previously, visibility: "shared" },
      ]);
    });
    // The write names the story's key, so the card reads itself again.
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it("unshares a shared story", async () => {
    keep(story(11, "shared"));
    await renderChronicle();
    const toggle = within(await keptCard()).getByRole("switch");
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    await waitFor(() => {
      expect(sent("PUT")).toEqual([
        { text: story(11).text, previously: story(11).previously, visibility: "dm" },
      ]);
    });
  });

  it("edits Hob's words into the DM's own, keeping who may read it", async () => {
    keep(story(11, "shared"));
    await renderChronicle();
    const kept = await keptCard();
    await userEvent.click(await within(kept).findByRole("button", { name: "Edit" }));

    const text = within(kept).getByLabelText("The story so far");
    await userEvent.clear(text);
    await userEvent.type(text, "  The caravan reached the flats.  ");
    await userEvent.clear(within(kept).getByLabelText("Previously"));
    await userEvent.click(within(kept).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(sent("PUT")).toEqual([
        { text: "The caravan reached the flats.", previously: null, visibility: "shared" },
      ]);
    });
    expect(await within(kept).findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("will not save an empty story", async () => {
    keep(story(11));
    await renderChronicle();
    const kept = await keptCard();
    await userEvent.click(await within(kept).findByRole("button", { name: "Edit" }));

    await userEvent.clear(within(kept).getByLabelText("The story so far"));

    expect(within(kept).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("asks before clearing, and clears only on the second press", async () => {
    keep(story(11));
    await renderChronicle();
    const kept = await keptCard();

    await userEvent.click(await within(kept).findByRole("button", { name: "Clear" }));
    await userEvent.click(await screen.findByRole("button", { name: "Keep it" }));
    expect(sent("DELETE")).toEqual([]);

    await userEvent.click(within(kept).getByRole("button", { name: "Clear" }));
    await userEvent.click(await screen.findByRole("button", { name: "Clear story" }));

    await waitFor(() => {
      expect(server.calls.some((call) => call.method === "DELETE")).toBe(true);
    });
  });
});
