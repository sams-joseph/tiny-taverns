import type { CampaignId } from "@taverns/api";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { campaignId } from "../campaign/campaign.fixtures";
import { Hob } from "./Hob";
import type { HobPanelState } from "./useHobPanel";

/**
 * The client half of the assistant: what the panel offers, and what it does
 * with an answer that arrives a piece at a time.
 *
 * The stub below is an SSE server, because that is what Hob is — a `POST` whose
 * body is a stream. Testing it with a JSON answer would test a different
 * product: the designers chose a persistent conversation surface over a one-shot
 * palette, and "the words appear as they are written" is the difference.
 */

interface Frame {
  readonly event: string;
  readonly data: unknown;
}

interface HobStub {
  /** What `GET …/hob` answers. */
  available: boolean;
  /** What `GET …/hob/threads` answers, newest first. */
  threads: Array<Record<string, unknown>>;
  /** What `GET …/hob/threads/:id/turns` answers, oldest first. */
  turns: Array<Record<string, unknown>>;
  /** Set to answer `accept` with a declared failure instead of the row. */
  acceptStatus: number | undefined;
  acceptBody: unknown;
  /** What `POST …/hob/ask` streams, in order, before closing. */
  frames: Array<Frame>;
  /**
   * Leave the answer open after `frames`, so a test can drive it in real time.
   *
   * A whole stream delivered in one microtask is not a stream as far as the
   * panel is concerned: every intermediate state — *"Searching the record…"* —
   * is gone before React can paint it. Holding the connection is what makes
   * those states assertable, and it is also what a slow local model does.
   */
  hold: boolean;
  /** Set to answer `ask` with a declared failure instead of a stream. */
  askStatus: number | undefined;
  askBody: unknown;
  readonly paths: Array<string>;
  /** The JSON body of every `ask`, in order. */
  readonly bodies: Array<string>;
  /** Every `accept` path, in order. */
  readonly accepts: Array<string>;
  /** Send one more frame down a held-open answer. */
  readonly push: (frame: Frame) => void;
  /** Finish a held-open answer. */
  readonly close: () => void;
  readonly reset: () => void;
}

/**
 * One `fetch` stub for the file, installed at module scope.
 *
 * `FetchHttpClient.Fetch` is a `Context.Reference` and `Context` memoises a
 * reference's default the first time it is read, so a per-test `vi.stubGlobal`
 * would keep serving the first test's answers with nothing to notice. Same
 * reason `api/client.test.ts` and `run.fixtures.tsx` say so.
 */
const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const stamp = "2026-08-12T20:00:00.000Z";

/** What `accept` answers with. The JSON the server sends, not a decoded class. */
const aNoteRow = {
  id: "8a1d1f28-3a4b-4c6d-9e11-0d2f3c4b5a60",
  campaignId: "0c8b0f5b-6c2e-4c5d-9f5a-8e5f9a2b3c4d",
  title: "The lantern-keeper",
  body: "She trims the wicks at dusk.",
  kind: "note",
  attachedTo: null,
  visibility: "dm",
  origin: "assistant",
  assistantTurnId: "c4f4b6d2-9b1a-4c3e-8f7a-2b1c3d4e5f60",
  createdAt: stamp,
  updatedAt: stamp,
};

const installHobServer = (): HobStub => {
  const encoder = new TextEncoder();
  const frameOf = (frame: Frame): Uint8Array =>
    encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`);
  let controllers: Array<ReadableStreamDefaultController<Uint8Array>> = [];

  const stub: HobStub = {
    available: true,
    threads: [],
    turns: [],
    acceptStatus: undefined,
    acceptBody: undefined,
    frames: [],
    hold: false,
    askStatus: undefined,
    askBody: undefined,
    paths: [],
    bodies: [],
    accepts: [],
    push: (frame) => {
      for (const controller of controllers) controller.enqueue(frameOf(frame));
    },
    close: () => {
      for (const controller of controllers) {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
      controllers = [];
    },
    reset: () => {
      stub.close();
      stub.available = true;
      stub.threads = [];
      stub.turns = [];
      stub.acceptStatus = undefined;
      stub.acceptBody = undefined;
      stub.frames = [];
      stub.hold = false;
      stub.askStatus = undefined;
      stub.askBody = undefined;
      stub.paths.length = 0;
      stub.bodies.length = 0;
      stub.accepts.length = 0;
    },
  };

  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => {
    const { pathname } = new URL(String(url));
    stub.paths.push(pathname);

    if (pathname.endsWith("/hob/ask")) {
      if (init?.body !== undefined)
        stub.bodies.push(new TextDecoder().decode(init.body as Uint8Array));
      if (stub.askStatus !== undefined)
        return Promise.resolve(
          new Response(JSON.stringify(stub.askBody), {
            status: stub.askStatus,
            headers: { "content-type": "application/json" },
          }),
        );
      const opening = stub.frames;
      const hold = stub.hold;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const frame of opening) controller.enqueue(frameOf(frame));
          if (hold) controllers.push(controller);
          else controller.close();
        },
      });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
      );
    }

    if (pathname.endsWith("/accept")) {
      stub.accepts.push(pathname);
      return Promise.resolve(
        stub.acceptStatus === undefined
          ? json({ accepted: "note", note: aNoteRow })
          : new Response(JSON.stringify(stub.acceptBody), {
              status: stub.acceptStatus,
              headers: { "content-type": "application/json" },
            }),
      );
    }

    if (pathname.endsWith("/turns")) return Promise.resolve(json(stub.turns));

    if (pathname.endsWith("/hob/threads")) return Promise.resolve(json(stub.threads));

    if (pathname.endsWith("/hob"))
      return Promise.resolve(
        json({
          available: stub.available,
          model: stub.available ? "local" : null,
          campaign: "The Salt Road",
        }),
      );

    return Promise.resolve(new Response("{}", { status: 404 }));
  });

  return stub;
};

const server = installHobServer();

const noSession: HostedSession = {
  configured: false,
  signedIn: false,
  fetchToken: () => Promise.resolve(undefined),
};

const panelState = (open: boolean): HobPanelState => ({
  open,
  inline: true,
  toggle: () => undefined,
  close: () => undefined,
  show: () => undefined,
});

/** Annotated `void` — Testing Library's `RenderResult` is not nameable here. */
const renderHob = (options?: { readonly open?: boolean; readonly campaign?: boolean }): void => {
  render(
    <HostedSessionContext value={noSession}>
      <Hob
        hob={panelState(options?.open ?? true)}
        campaignId={options?.campaign === false ? undefined : (campaignId as CampaignId)}
      />
    </HostedSessionContext>,
  );
};

const delta = (text: string): Frame => ({ event: "delta", data: { text } });
const tool = (name: string, phase: string, detail: string): Frame => ({
  event: "tool",
  data: { name, phase, detail },
});
const began = (thread: string, turn: string): Frame => ({
  event: "began",
  data: { threadId: thread, turnId: turn },
});
const proposed = (turn: string, proposal: unknown): Frame => ({
  event: "proposal",
  data: { turnId: turn, proposal },
});

const threadId = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
const turnId = "c4f4b6d2-9b1a-4c3e-8f7a-2b1c3d4e5f60";

/**
 * A saved thread, as the server sends it.
 *
 * The whole row and not a `Partial<>`, for the reason `campaign.fixtures.tsx`
 * gives: a field the contract renames has to fail the decode here rather than
 * render as `undefined` somewhere later. It is also load-bearing in a way that
 * is easy to miss — a thread missing `campaignId` fails to decode, the read
 * reports a failure, and the panel correctly shows nothing at all.
 */
const aThread = (title: string) => ({
  id: threadId,
  campaignId,
  title,
  createdAt: stamp,
  updatedAt: stamp,
});

/** The encounter Hob offers, as the server sends it: resolved, with real ids. */
const anEncounter = {
  target: "encounter",
  name: "Song in the reeds",
  difficulty: "Hard",
  tags: ["Marsh"],
  roster: [
    {
      creatureId: "aa11bb22-cc33-4d44-8e55-ff6677889900",
      count: 3,
      name: "Bullywug Croaker",
      cr: "1/4",
      hp: 11,
    },
  ],
};

beforeEach(() => server.reset());

const composer = () => screen.queryByRole("textbox", { name: "Ask Hob" });

describe("what the panel offers", () => {
  it("asks nothing at all until it is opened", async () => {
    renderHob({ open: false });

    // The panel is closed on every screen by default. A status request per page
    // load, for a surface nobody opened, is a request nobody asked for.
    await Promise.resolve();
    expect(server.paths).toEqual([]);
  });

  it("offers no composer outside a campaign, and says to open one", async () => {
    renderHob({ campaign: false });

    expect(composer()).toBeNull();
    expect(screen.getByText(/no campaign in view/)).toBeInTheDocument();
    // Nothing is asked either: there is no campaign to ask about.
    expect(server.paths).toEqual([]);
  });

  it("offers no composer when the server has no model, and names the fix", async () => {
    server.available = false;
    renderHob();

    await waitFor(() => expect(screen.getByText(/No model is configured/)).toBeInTheDocument());
    expect(screen.getByText(/HOB_API_URL and HOB_MODEL/)).toBeInTheDocument();
    expect(composer()).toBeNull();
  });

  it("offers a composer once the server says a model is behind it", async () => {
    renderHob();

    await waitFor(() => expect(composer()).not.toBeNull());
  });

  it("shows what Hob knows, and only what the server vouched for", async () => {
    renderHob();

    // The campaign it is bound to and the model that will answer. The delivered
    // fixture also names a party and a fight on the table; nothing reads those,
    // so they are absent rather than invented.
    const strip = await screen.findByLabelText("What Hob knows");
    expect(strip).toHaveTextContent("The Salt Road");
    expect(strip).toHaveTextContent("local");
    expect(strip).not.toHaveTextContent("avg. level 5");
  });
});

describe("an answer", () => {
  it("arrives a piece at a time, and lands in one reply", async () => {
    server.frames = [
      delta("The ferryman "),
      delta("is called "),
      delta("Cazril."),
      { event: "done", data: { reason: "stop" } },
    ];
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());

    await userEvent.type(composer()!, "Who is the ferryman?{Enter}");

    // One reply, not three: the deltas append to the turn already in flight.
    await waitFor(() =>
      expect(screen.getByText("The ferryman is called Cazril.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Who is the ferryman?")).toBeInTheDocument();
  });

  it("says what it is reaching for while it reaches", async () => {
    server.frames = [tool("searchCampaign", "called", "ferryman")];
    server.hold = true;
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());

    await userEvent.type(composer()!, "Who is the ferryman?{Enter}");

    // Hob's whole claim is that its answers come out of the DM's own record,
    // and the moment it reaches for one is the only moment that is visible.
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Searching the record — ferryman"),
    );

    server.push(tool("searchCampaign", "answered", "3 results"));
    server.push(delta("Cazril."));
    await waitFor(() => expect(screen.getByText("Cazril.")).toBeInTheDocument());
    // The line goes as soon as there are words to read instead.
    expect(screen.queryByRole("status")).toBeNull();

    server.close();
  });

  it("sends one question and the thread it belongs to, and nothing else", async () => {
    server.frames = [
      began(threadId, "5f0c3a2b-1d4e-4a6f-8b9c-0d1e2f3a4b5c"),
      delta("Cazril."),
      { event: "done", data: { reason: "stop" } },
    ];
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());
    await userEvent.type(composer()!, "Who is the ferryman?{Enter}");
    await waitFor(() => expect(screen.getByText("Cazril.")).toBeInTheDocument());

    server.frames = [
      began(threadId, "6a1d4b3c-2e5f-4b7a-9c0d-1e2f3a4b5c6d"),
      delta("A ledger."),
      { event: "done", data: { reason: "stop" } },
    ];
    await userEvent.type(composer()!, "And the crate?{Enter}");
    await waitFor(() => expect(server.bodies).toHaveLength(2));

    // The conversation is the server's, so a question carries a thread id
    // rather than a transcript the client kept — which is what stops a client
    // rewriting what it was told, and what makes a reload lossless. The first
    // question names no thread because there was none.
    expect(JSON.parse(server.bodies[0]!)).toEqual({ text: "Who is the ferryman?" });
    expect(JSON.parse(server.bodies[1]!)).toEqual({
      threadId,
      text: "And the crate?",
    });
  });

  it("puts a mid-stream failure in the thread rather than losing it", async () => {
    server.frames = [
      delta("I looked, but "),
      { event: "failed", data: { message: "The model stopped answering." } },
    ];
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());

    await userEvent.type(composer()!, "Who is the ferryman?{Enter}");

    await waitFor(() =>
      expect(screen.getByText("The model stopped answering.")).toBeInTheDocument(),
    );
    // The half-written reply stays: it is what Hob managed to say.
    expect(screen.getByText("I looked, but")).toBeInTheDocument();
  });

  it("repeats the server's own sentence when the model is switched off mid-session", async () => {
    server.askStatus = 503;
    server.askBody = {
      _tag: "HobUnavailable",
      message: "Hob has no model behind it. Set HOB_API_URL and HOB_MODEL.",
    };
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());

    await userEvent.type(composer()!, "Who is the ferryman?{Enter}");

    // The fix lives in the process that knows it, not in a sentence composed
    // here — see `ApiFailure`'s `unavailable`.
    await waitFor(() =>
      expect(screen.getByText(/Set HOB_API_URL and HOB_MODEL\./)).toBeInTheDocument(),
    );
  });

  it("offers no Save for a plain answer, because prose is not an artifact", async () => {
    server.frames = [delta("Cazril."), { event: "done", data: { reason: "stop" } }];
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());
    await userEvent.type(composer()!, "Who is the ferryman?{Enter}");
    await waitFor(() => expect(screen.getByText("Cazril.")).toBeInTheDocument());

    // A card appears when Hob *proposes* something, and only then.
    expect(screen.queryByRole("button", { name: "Save to session" })).toBeNull();
  });
});

describe("the conversation is still there", () => {
  it("reads the newest thread back when the panel is opened", async () => {
    server.threads = [aThread("Who is the ferryman?")];
    server.turns = [
      {
        id: "aaaaaaa1-0000-4000-8000-000000000001",
        threadId,
        who: "user",
        text: "Who is the ferryman?",
        proposal: null,
        acceptedAt: null,
        createdAt: stamp,
      },
      {
        id: turnId,
        threadId,
        who: "hob",
        text: "Cazril, and he takes only a name.",
        proposal: null,
        acceptedAt: null,
        createdAt: stamp,
      },
    ];

    renderHob();

    // The gap this closed: an evening's conversation used to be React state and
    // nothing else, so a reload was an empty panel.
    await waitFor(() =>
      expect(screen.getByText("Cazril, and he takes only a name.")).toBeInTheDocument(),
    );
    expect(screen.getByText("Who is the ferryman?")).toBeInTheDocument();
  });

  it("continues that thread rather than starting a new one", async () => {
    server.threads = [aThread("Who is the ferryman?")];
    server.turns = [
      {
        id: turnId,
        threadId,
        who: "hob",
        text: "Cazril.",
        proposal: null,
        acceptedAt: null,
        createdAt: stamp,
      },
    ];
    renderHob();
    await waitFor(() => expect(screen.getByText("Cazril.")).toBeInTheDocument());

    server.frames = [delta("A ledger."), { event: "done", data: { reason: "stop" } }];
    await userEvent.type(composer()!, "And the crate?{Enter}");
    await waitFor(() => expect(server.bodies).toHaveLength(1));

    expect(JSON.parse(server.bodies[0]!)).toEqual({ threadId, text: "And the crate?" });
  });

  it("draws a proposal it was told about, and marks one already accepted", async () => {
    server.threads = [aThread("Build me an ambush")];
    server.turns = [
      {
        id: turnId,
        threadId,
        who: "hob",
        text: "Six of them, in the reeds.",
        proposal: anEncounter,
        acceptedAt: stamp,
        createdAt: stamp,
      },
    ];

    renderHob();

    await waitFor(() => expect(screen.getByText("Song in the reeds")).toBeInTheDocument());
    expect(screen.getByText("Bullywug Croaker")).toBeInTheDocument();
    // Already a row in the campaign, so the card says so instead of offering to
    // save it again.
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save to session" })).toBeNull();
  });

  /**
   * The one property the whole feature rests on, pinned from the read-back path
   * as well as from the live one.
   *
   * A recorded turn is a row with a `who` *and* a `proposal`, and those two are
   * independent: what decides whether a card is drawn is the proposal, never who
   * spoke. Both these turns are `who: "hob"` and both carry the same prose — the
   * only difference between them is the column — so a panel that branched on the
   * speaker would render them identically and this is what would say so.
   *
   * It is also the difference between a suggestion the DM can act on and one
   * they can only read: without the card there is no accept, and without an
   * accept nothing Hob offers can ever enter the campaign.
   */
  it("draws a card for the turn that proposed, and none for the turn that only spoke", async () => {
    server.threads = [aThread("Build me an ambush")];
    server.turns = [
      // Same speaker, same shape, no proposal: prose and nothing else.
      {
        id: "0a9b8c7d-6e5f-4a3b-8c1d-0e9f8a7b6c5d",
        threadId,
        who: "hob",
        text: "The crossing is watched.",
        proposal: null,
        acceptedAt: null,
        createdAt: stamp,
      },
      {
        id: turnId,
        threadId,
        who: "hob",
        text: "Six of them, in the reeds.",
        proposal: anEncounter,
        acceptedAt: null,
        createdAt: stamp,
      },
    ];

    renderHob();

    // One turn became two rows — the words, and the card — which is why
    // `shownAs` is a `flatMap`. Both halves are the DM's to read.
    await waitFor(() => expect(screen.getByText("Song in the reeds")).toBeInTheDocument());
    expect(screen.getByText("Six of them, in the reeds.")).toBeInTheDocument();
    expect(screen.getByText("The crossing is watched.")).toBeInTheDocument();

    // Exactly one accept, and it is offered rather than disabled: an unaccepted
    // proposal is the whole point of the card.
    const save = screen.getAllByRole("button", { name: "Save to session" });
    expect(save).toHaveLength(1);
    expect(save[0]).toBeEnabled();
    expect(screen.queryByText("Saved")).toBeNull();

    // And it reaches the endpoint that materialises the row, naming the turn
    // that proposed it and nothing else.
    await userEvent.click(save[0]!);
    await waitFor(() =>
      expect(server.accepts).toEqual([
        `/campaigns/${campaignId}/hob/threads/${threadId}/turns/${turnId}/accept`,
      ]),
    );
  });

  it("starts a new thread when the DM asks for one", async () => {
    server.threads = [aThread("Who is the ferryman?")];
    server.turns = [
      {
        id: turnId,
        threadId,
        who: "hob",
        text: "Cazril.",
        proposal: null,
        acceptedAt: null,
        createdAt: stamp,
      },
    ];
    renderHob();
    await waitFor(() => expect(screen.getByText("Cazril.")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "New thread" }));
    expect(screen.queryByText("Cazril.")).toBeNull();

    server.frames = [delta("Right.")];
    server.hold = true;
    await userEvent.type(composer()!, "Something else.{Enter}");
    await waitFor(() => expect(server.bodies).toHaveLength(1));

    // No thread named: the server starts one. The old evening is untouched.
    expect(JSON.parse(server.bodies[0]!)).toEqual({ text: "Something else." });
    server.close();
  });
});

describe("what Hob offers, and the one thing that writes", () => {
  const askForAnAmbush = async () => {
    server.frames = [
      began(threadId, turnId),
      delta("Six of them."),
      proposed(turnId, anEncounter),
      { event: "done", data: { reason: "stop" } },
    ];
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());
    await userEvent.type(composer()!, "Build me an ambush.{Enter}");
    await waitFor(() => expect(screen.getByText("Song in the reeds")).toBeInTheDocument());
  };

  it("draws the card, with the roster the server resolved", async () => {
    await askForAnAmbush();

    expect(screen.getByText("Bullywug Croaker")).toBeInTheDocument();
    expect(screen.getByText("×3")).toBeInTheDocument();
    expect(screen.getByText("CR 1/4")).toBeInTheDocument();
    // The DMG band, verbatim. No adjusted XP: no shipped column holds one.
    expect(screen.getByText("Hard")).toBeInTheDocument();
    expect(screen.getByText("3 creatures")).toBeInTheDocument();
  });

  it("writes nothing until Save is pressed, and then names only ids", async () => {
    await askForAnAmbush();

    // Nothing has been accepted: the card is an offer, and the campaign is as
    // it was. This is the client half of the captain's rule.
    expect(server.accepts).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Save to session" }));

    await waitFor(() => expect(server.accepts).toHaveLength(1));
    // The path is the whole request — campaign, thread and turn. No content:
    // the row is built from the proposal the server stored, which is what makes
    // the provenance it records worth having.
    expect(server.accepts[0]).toBe(
      `/campaigns/${campaignId}/hob/threads/${threadId}/turns/${turnId}/accept`,
    );
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("says so in the thread when the accept was refused", async () => {
    await askForAnAmbush();
    server.acceptStatus = 409;
    server.acceptBody = { _tag: "Conflict", message: "that is already in the campaign" };

    await userEvent.click(screen.getByRole("button", { name: "Save to session" }));

    await waitFor(() =>
      expect(screen.getByText(/that is already in the campaign/)).toBeInTheDocument(),
    );
    // And the card does not claim to be saved.
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
