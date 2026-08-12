import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HobPanel } from "./HobPanel";
import { SAMPLE_ENCOUNTER, SAMPLE_RULES, SAMPLE_THREAD } from "./hob.fixtures";
import type { HobTurn } from "./transcript";

/**
 * The panel's states, and the one property that matters most: **it never
 * speaks unless it was given something to say.**
 *
 * The first two tests are that property from both sides. Everything else is the
 * designers' states, driven by the delivered fixtures. What is behind the panel
 * — the status probe, the stream, the thread — is `conversation.test.tsx`; this
 * file is the surface on its own, which is how it can be driven by fixtures at
 * all.
 */

describe("HobPanel, with nothing behind it", () => {
  it("offers no input at all, and says why it cannot answer", () => {
    render(<HobPanel turns={[]} unavailable="No model is configured behind Hob." />);

    expect(screen.queryByRole("textbox", { name: "Ask Hob" })).toBeNull();
    // The reason is passed in because there are two of them and both are
    // actionable — `conversation.ts` is where they are written.
    expect(screen.getByText("No model is configured behind Hob.")).toBeInTheDocument();
  });

  it("renders the empty state every DM meets first, with the starters inert", () => {
    render(<HobPanel turns={[]} />);

    expect(screen.getByText("What are we building tonight?")).toBeInTheDocument();
    // All four of `chat-data.js`'s starters, and none of them clickable.
    expect(screen.getByRole("button", { name: /Build an encounter/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Prep tonight's session/ })).toBeDisabled();
  });

  it("draws no context strip it was not given chips for", () => {
    // Context is shown rather than asked for — but only what a caller can
    // vouch for. The delivered fixture names a party and a fight on the table
    // that nothing reads, so an unasked strip would be a fabrication on a
    // surface whose whole claim is that its answers are not.
    render(<HobPanel turns={[]} />);
    expect(screen.queryByLabelText("What Hob knows")).toBeNull();

    cleanup();
    render(<HobPanel turns={[]} context={[{ icon: "book-open", label: "The Salt Road" }]} />);
    const context = screen.getByLabelText("What Hob knows");
    expect(within(context).getByText("The Salt Road")).toBeInTheDocument();
  });
});

describe("HobPanel, given a thread", () => {
  it("renders the delivered sample: both voices, the aside, and the artifact", () => {
    render(<HobPanel turns={SAMPLE_THREAD} />);

    expect(
      screen.getByText(/heading into the reeds tonight/),
      // The DM's own message.
    ).toBeInTheDocument();
    expect(screen.getByText(/Four levels of five/)).toBeInTheDocument();
    // The persona, and the only place it is allowed to appear.
    expect(screen.getByText(/I noticed\./)).toBeInTheDocument();

    expect(screen.getByText("Song in the reeds")).toBeInTheDocument();
    expect(screen.getByText("Encounter")).toBeInTheDocument();
    expect(screen.getByText("Bullywug Croaker")).toBeInTheDocument();
    expect(screen.getByText("Hard for 4 level-5s")).toBeInTheDocument();
  });

  it("shows the empty state only when there is nothing at all", () => {
    render(<HobPanel turns={SAMPLE_THREAD} />);

    expect(screen.queryByText("What are we building tonight?")).toBeNull();
  });

  it("renders the thinking state, and says what Hob is reaching for when it knows", () => {
    render(<HobPanel turns={SAMPLE_THREAD} thinking />);
    expect(screen.getByRole("status")).toHaveTextContent("Hob is checking the ledger");

    cleanup();
    render(<HobPanel turns={SAMPLE_THREAD} thinking activity="Searching the record — ferryman…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Searching the record — ferryman");
  });
});

describe("the artifact card", () => {
  const one: ReadonlyArray<HobTurn> = [{ id: "a", who: "artifact", artifact: SAMPLE_ENCOUNTER }];

  it("disables every action it was given no handler for", () => {
    render(<HobPanel turns={one} />);

    expect(screen.getByRole("button", { name: "Save to session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  });

  it("swaps to the saved state, which offers Open it instead", () => {
    render(<HobPanel turns={one} savedArtifactIds={[SAMPLE_ENCOUNTER.id]} />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open it" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save to session" })).toBeNull();
  });

  it("gives a rules answer no Save — nothing to save, it is just an answer", () => {
    render(<HobPanel turns={[{ id: "r", who: "artifact", artifact: SAMPLE_RULES }]} />);

    expect(screen.getByText("Rules")).toBeInTheDocument();
    expect(screen.getByText(/Nothing to save/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save to session" })).toBeNull();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("edits the title in place, and reports the new one", async () => {
    const onRename = vi.fn();
    const user = userEvent.setup();
    render(<HobPanel turns={one} onRename={onRename} />);

    await user.click(screen.getByRole("button", { name: "Song in the reeds" }));
    const field = screen.getByRole("textbox", { name: "Title" });
    await user.clear(field);
    await user.type(field, "Song in the marsh{Enter}");

    expect(onRename).toHaveBeenCalledWith(SAMPLE_ENCOUNTER, "Song in the marsh");
  });
});

describe("the composer, once something is listening", () => {
  it("sends what was typed and clears itself", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<HobPanel turns={SAMPLE_THREAD} onSend={onSend} />);

    const field = screen.getByRole("textbox", { name: "Ask Hob" });
    await user.type(field, "Something for the reeds{Enter}");

    expect(onSend).toHaveBeenCalledWith("Something for the reeds");
    expect(field).toHaveValue("");
  });

  it("filters the slash commands as they are typed — locally, and only those", async () => {
    const user = userEvent.setup();
    render(<HobPanel turns={SAMPLE_THREAD} onSend={vi.fn()} />);

    expect(screen.queryByLabelText("Commands")).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "Ask Hob" }), "/re");
    const menu = screen.getByLabelText("Commands");

    expect(within(menu).getByText("/read-aloud")).toBeInTheDocument();
    expect(within(menu).queryByText("/encounter")).toBeNull();
  });

  it("takes a starter card as the first thing typed", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<HobPanel turns={[]} onSend={onSend} />);

    await user.click(screen.getByRole("button", { name: /Name an NPC/ }));

    expect(onSend).toHaveBeenCalledWith("Name an NPC");
  });
});
