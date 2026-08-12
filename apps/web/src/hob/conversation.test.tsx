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
const installHobServer = (): HobStub => {
  const encoder = new TextEncoder();
  const frameOf = (frame: Frame): Uint8Array =>
    encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`);
  let controllers: Array<ReadableStreamDefaultController<Uint8Array>> = [];

  const stub: HobStub = {
    available: true,
    frames: [],
    hold: false,
    askStatus: undefined,
    askBody: undefined,
    paths: [],
    bodies: [],
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
      stub.frames = [];
      stub.hold = false;
      stub.askStatus = undefined;
      stub.askBody = undefined;
      stub.paths.length = 0;
      stub.bodies.length = 0;
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

    if (pathname.endsWith("/hob"))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            available: stub.available,
            model: stub.available ? "local" : null,
            campaign: "The Salt Road",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
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

  it("sends the whole thread, and nothing about the campaign", async () => {
    server.frames = [delta("Cazril."), { event: "done", data: { reason: "stop" } }];
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());
    await userEvent.type(composer()!, "Who is the ferryman?{Enter}");
    await waitFor(() => expect(screen.getByText("Cazril.")).toBeInTheDocument());

    server.frames = [delta("A ledger."), { event: "done", data: { reason: "stop" } }];
    await userEvent.type(composer()!, "And the crate?{Enter}");
    await waitFor(() => expect(server.bodies).toHaveLength(2));

    // The thread travels in the payload because nothing is stored server-side:
    // there is no `assistant_turn` row until something writes an assistant row.
    // The campaign is in the path and in nothing else.
    expect(JSON.parse(server.bodies[1]!)).toEqual({
      messages: [
        { who: "user", text: "Who is the ferryman?" },
        { who: "hob", text: "Cazril." },
        { who: "user", text: "And the crate?" },
      ],
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

  it("offers no Save, because nothing may be saved yet", async () => {
    server.frames = [delta("Cazril."), { event: "done", data: { reason: "stop" } }];
    renderHob();
    await waitFor(() => expect(composer()).not.toBeNull());
    await userEvent.type(composer()!, "Who is the ferryman?{Enter}");
    await waitFor(() => expect(screen.getByText("Cazril.")).toBeInTheDocument());

    // Generation-with-approval is the captain's decision and the accept path is
    // unbuilt. An answer is prose, not an artifact, so there is no card and no
    // Save to disable.
    expect(screen.queryByRole("button", { name: "Save to session" })).toBeNull();
  });
});
