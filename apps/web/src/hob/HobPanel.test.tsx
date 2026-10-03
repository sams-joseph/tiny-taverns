import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateTime } from "effect";
import { describe, expect, it, vi } from "vitest";
import { HobPanel } from "./HobPanel";
import { useHobPanel } from "./useHobPanel";
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

  it("leaves out every answer it was given no handler for, rather than drawing a dead one", () => {
    render(<HobPanel turns={one} />);

    expect(screen.getByRole("button", { name: "Save to session" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("hands Discard and Try again the card they were pressed on", async () => {
    const onDiscard = vi.fn();
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<HobPanel turns={one} onDiscard={onDiscard} onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledWith(SAMPLE_ENCOUNTER);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledWith(SAMPLE_ENCOUNTER);
  });

  it("holds Try again while another answer is arriving, and only that", () => {
    render(<HobPanel turns={one} onDiscard={vi.fn()} onRetry={vi.fn()} answering />);

    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
  });

  it("swaps to the saved state, which offers Open it for a card that can be opened", async () => {
    const onOpenArtifact = vi.fn();
    const user = userEvent.setup();
    render(
      <HobPanel
        turns={one}
        savedArtifactIds={[SAMPLE_ENCOUNTER.id]}
        onOpenArtifact={onOpenArtifact}
        openableArtifactIds={[SAMPLE_ENCOUNTER.id]}
      />,
    );

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save to session" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open it" }));
    expect(onOpenArtifact).toHaveBeenCalledWith(SAMPLE_ENCOUNTER);
  });

  it("offers no Open it on a saved card with nothing to open", () => {
    render(
      <HobPanel turns={one} savedArtifactIds={[SAMPLE_ENCOUNTER.id]} onOpenArtifact={vi.fn()} />,
    );

    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open it" })).toBeNull();
  });

  it("gives a rules answer no Save — nothing to save, it is just an answer", () => {
    render(
      <HobPanel
        turns={[{ id: "r", who: "artifact", artifact: SAMPLE_RULES }]}
        onDiscard={vi.fn()}
      />,
    );

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

describe("Hob's mark, beside a reply that grew", () => {
  /**
   * **This proves the mechanism, not the layout.** jsdom computes no layout, so
   * no test in this environment can see an avatar stretch — the same blind spot
   * `motion.test.ts` and `layering.test.ts` exist for, and the reason this
   * shipped green. The measurement is in the task record: 28 × 45.4 beside a
   * two-line reply and 28 × 159.5 beside a long one, because preflight's
   * `img { height: auto }` beats the `height` attribute and the row's default
   * `align-items: stretch` then grows the mark. What is checkable here is the
   * one line that closes it: the mark states its height in CSS, so its cross
   * size is never `auto` and no row can stretch it.
   */
  it("states its height in CSS as well as in the attribute", () => {
    const { container } = render(<HobPanel turns={SAMPLE_THREAD} />);
    const marks = [...container.querySelectorAll("img")];

    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.style.height).toBe(`${mark.getAttribute("height") ?? ""}px`);
    }
  });

  it("never sits in a row that states no alignment", () => {
    const { container } = render(<HobPanel turns={SAMPLE_THREAD} thinking />);
    const rows = [...container.querySelectorAll("img")].map((mark) => mark.parentElement);

    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      // A reply aligns to the first line, a one-line row centres — and a row
      // that says neither is the row that stretches.
      expect(row?.className).toMatch(/items-(start|center)/);
    }
  });
});

describe("the conversations list", () => {
  const at = DateTime.makeUnsafe("2026-08-12T20:00:00.000Z");
  const ready = {
    state: "ready" as const,
    threads: [
      { id: "t-new", title: "Who is the ferryman?", updatedAt: at },
      { id: "t-old", title: "Build me an ambush in the reeds", updatedAt: at },
    ],
  };
  const listed = () => screen.getByRole("dialog", { name: "Conversations" });

  it("draws no control it was given no list for", () => {
    render(<HobPanel turns={[]} />);
    expect(screen.queryByRole("button", { name: "Conversations" })).toBeNull();
  });

  it("reads the list on opening, and hands back the one picked", async () => {
    const user = userEvent.setup();
    const onListThreads = vi.fn();
    const onOpenThread = vi.fn();
    render(
      <HobPanel
        turns={SAMPLE_THREAD}
        threadList={ready}
        threadId="t-new"
        onListThreads={onListThreads}
        onOpenThread={onOpenThread}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Conversations" }));
    expect(onListThreads).toHaveBeenCalledOnce();
    expect(within(listed()).getByRole("button", { name: /Who is the ferryman/ })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await user.click(within(listed()).getByRole("button", { name: /Build me an ambush/ }));
    expect(onOpenThread).toHaveBeenCalledWith("t-old");
    expect(screen.queryByRole("dialog", { name: "Conversations" })).toBeNull();
  });

  it("closes on Escape, and the panel around it stays open", async () => {
    const user = userEvent.setup();
    // The real owner of Esc, which closes the whole panel on a key nobody consumed.
    function Panel() {
      const hob = useHobPanel();
      return (
        <>
          <output>{hob.open ? "panel open" : "panel closed"}</output>
          <HobPanel
            turns={[]}
            threadList={ready}
            onListThreads={() => undefined}
            onOpenThread={() => undefined}
          />
        </>
      );
    }
    render(<Panel />);
    await user.click(screen.getByRole("button", { name: "Conversations" }));
    expect(listed()).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Conversations" })).toBeNull();
    expect(screen.getByText("panel open")).toBeInTheDocument();

    // And the next Escape is the panel's, as it was before the list opened.
    await user.keyboard("{Escape}");
    expect(screen.getByText("panel closed")).toBeInTheDocument();
  });

  it("says when there is nothing to list, and offers another read when the list failed", async () => {
    const user = userEvent.setup();
    const onListThreads = vi.fn();
    const props = { turns: [], onListThreads, onOpenThread: () => undefined };
    render(<HobPanel {...props} threadList={{ state: "ready", threads: [] }} />);
    await user.click(screen.getByRole("button", { name: "Conversations" }));
    expect(within(listed()).getByText("No conversations yet")).toBeInTheDocument();

    cleanup();
    onListThreads.mockClear();
    render(<HobPanel {...props} threadList={{ state: "failed" }} />);
    await user.click(screen.getByRole("button", { name: "Conversations" }));
    await user.click(within(listed()).getByRole("button", { name: "Try again" }));
    expect(onListThreads).toHaveBeenCalledTimes(2);
  });

  it("holds the starters back while a picked conversation is on its way", () => {
    render(<HobPanel turns={[]} opening />);
    expect(screen.queryByText("What are we building tonight?")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Opening the conversation…");
  });
});
