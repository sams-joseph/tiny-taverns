import { CampaignId } from "@taverns/api";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { CampaignScreen } from "./CampaignScreen";

/**
 * The campaign view against a stubbed wire, decoded by the real client.
 *
 * The bodies below are the JSON the server actually sends, not the decoded
 * classes: everything passes through `packages/api`'s schemas on the way in, so
 * a field the contract renames fails here rather than rendering `undefined`.
 *
 * One permanent `fetch` stub, re-aimed per test — `FetchHttpClient.Fetch` is a
 * `Context.Reference` and `Context` memoises a reference's default the first
 * time it is read, so a per-test `vi.stubGlobal` would keep serving the first
 * test's answers with nothing to notice. See `api/client.test.ts`.
 */

const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const sessionId = "2b1f2a1e-0000-4000-8000-000000000501";
const encounterId = "2b1f2a1e-0000-4000-8000-000000000601";
const prepItemId = "2b1f2a1e-0000-4000-8000-000000000701";

const stamps = { createdAt: "2026-08-04T13:03:28.070Z", updatedAt: "2026-08-04T13:03:28.070Z" };
const provenance = { origin: "authored", assistantTurnId: null };

const campaign = {
  id: campaignId,
  name: "The Salt Road",
  partyName: "The Gilded Spoon",
  playerCount: 4,
  currentSessionId: sessionId,
  visibility: "dm",
  archivedAt: null,
  ...provenance,
  ...stamps,
};

const session = {
  id: sessionId,
  campaignId,
  number: 12,
  title: null,
  startedAt: null,
  endedAt: null,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

const encounter = {
  id: encounterId,
  campaignId,
  name: "Ambush in the reeds",
  difficulty: "Medium",
  tags: ["Marsh", "Night"],
  visibility: "dm",
  ...provenance,
  ...stamps,
};

const sketch = {
  ...encounter,
  id: "2b1f2a1e-0000-4000-8000-000000000602",
  name: "Whatever is in the crate",
  difficulty: null,
  tags: ["Boss"],
};

const readAloud = {
  id: "2b1f2a1e-0000-4000-8000-000000000801",
  campaignId,
  title: "Read aloud at the water",
  body: "The reeds are taller than you are and they are not moving, even though there is a wind.",
  kind: "read_aloud",
  attachedTo: { kind: "encounter", id: encounterId },
  visibility: "dm",
  ...provenance,
  ...stamps,
};

const character = {
  id: "2b1f2a1e-0000-4000-8000-000000000901",
  campaignId,
  name: "Brannoc",
  playerName: "Ilse",
  descriptor: "Half-orc paladin",
  ac: 18,
  hpMax: 52,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

const prepItem = {
  id: prepItemId,
  sessionId,
  label: "Reread the reeds ambush",
  done: false,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/** The stub server: a path → answer table, re-aimed per test. */
let routes = new Map<string, Answer>();
let transportDown = false;
const calls: Array<{ method: string; pathname: string; authorization?: string; body: string }> = [];

const fullCampaign = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET /campaigns/${campaignId}`, { status: 200, body: campaign }],
    [`GET /campaigns/${campaignId}/encounters`, { status: 200, body: [encounter, sketch] }],
    [`GET /campaigns/${campaignId}/notes`, { status: 200, body: [readAloud] }],
    [`GET /campaigns/${campaignId}/characters`, { status: 200, body: [character] }],
    [`GET /campaigns/${campaignId}/sessions/${sessionId}`, { status: 200, body: session }],
    [`GET /campaigns/${campaignId}/sessions/${sessionId}/prep`, { status: 200, body: [prepItem] }],
    [
      `PATCH /campaigns/${campaignId}/sessions/${sessionId}/prep/${prepItemId}`,
      { status: 200, body: { ...prepItem, done: true } },
    ],
  ]);

vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
  if (transportDown) return Promise.reject(new TypeError("Failed to fetch"));

  const { pathname } = new URL(String(url));
  const method = init?.method ?? "GET";
  const headers = init?.headers as Record<string, string> | undefined;
  calls.push({
    method,
    pathname,
    authorization: headers?.["authorization"],
    body: init?.body === undefined ? "" : new TextDecoder().decode(init.body as Uint8Array),
  });

  const answer = routes.get(`${method} ${pathname}`) ?? {
    status: 404,
    body: { _tag: "NotFound", resource: "campaign", id: campaignId },
  };
  return Promise.resolve(
    new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    }),
  );
});

/** A signed-in hosted session that mints a different token on every call. */
const mintingSession = (): HostedSession & { readonly minted: () => number } => {
  let issued = 0;
  return {
    configured: true,
    signedIn: true,
    fetchToken: () => Promise.resolve(`session-token-${++issued}`),
    minted: () => issued,
  };
};

const renderScreen = (hosted?: HostedSession) =>
  render(
    <HostedSessionContext
      value={
        hosted ?? {
          configured: false,
          signedIn: false,
          fetchToken: () => Promise.resolve(undefined),
        }
      }
    >
      <CampaignScreen campaignId={campaignId} route={{ screen: "campaign", campaignId }} />
    </HostedSessionContext>,
  );

/**
 * jsdom here ships **no** `localStorage` at all — neither `window.localStorage`
 * nor the bare global, since Node 26's own one is inert without
 * `--localstorage-file`. `auth/credential.ts` tolerates that (the machine token
 * simply reads empty), so exercising the fallback needs a real one installed.
 */
const memoryStorage = (): Storage => {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
    clear: () => entries.clear(),
    key: (index) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  };
};

Object.defineProperty(window, "localStorage", {
  value: memoryStorage(),
  configurable: true,
  writable: true,
});

beforeEach(() => {
  routes = fullCampaign();
  transportDown = false;
  calls.length = 0;
  window.localStorage.clear();
});

describe("CampaignScreen", () => {
  it("renders the campaign the six endpoints describe", async () => {
    renderScreen(mintingSession());

    expect(await screen.findByRole("heading", { name: "The Salt Road" })).toBeInTheDocument();
    // The subtitle is assembled from two rows: the session's number and the
    // campaign's party name.
    expect(screen.getByText("Session 12 · The Gilded Spoon")).toBeInTheDocument();

    expect(screen.getByText("Ambush in the reeds")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Marsh")).toBeInTheDocument();
    // A note hanging off this encounter, counted on its card.
    expect(screen.getByText("1 note")).toBeInTheDocument();
    // Null difficulty is its own state, not a missing badge.
    expect(screen.getByText("Unrated")).toBeInTheDocument();
  });

  it("sets read-aloud prose apart, in the prose face", async () => {
    renderScreen(mintingSession());

    await screen.findByRole("tab", { name: "Notes" });
    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));

    const prose = await screen.findByText(/The reeds are taller than you are/);
    // `--type-read-aloud`: italic Alegreya at --fs-body-l / --lh-loose. The one
    // register shift in the product, and it has to be visible, not just tonal.
    expect(prose).toHaveClass("font-serif", "italic", "text-body-l", "leading-loose");
    expect(screen.getByText("Read aloud")).toBeInTheDocument();
  });

  it("assembles a party row out of the separate columns", async () => {
    renderScreen(mintingSession());

    await screen.findByRole("tab", { name: "Party" });
    await userEvent.click(screen.getByRole("tab", { name: "Party" }));

    expect(await screen.findByText("Brannoc")).toBeInTheDocument();
    expect(screen.getByText("Half-orc paladin · Ilse")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("ticks a prep item off and saves it", async () => {
    renderScreen(mintingSession());

    const item = await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });
    expect(screen.getByText("0/1")).toBeInTheDocument();

    await userEvent.click(item);

    expect(screen.getByText("1/1")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.some((call) => call.method === "PATCH" && JSON.parse(call.body).done === true),
      ).toBe(true),
    );
  });

  it("puts the tick back when the save fails", async () => {
    routes.delete(`PATCH /campaigns/${campaignId}/sessions/${sessionId}/prep/${prepItemId}`);
    renderScreen(mintingSession());

    const item = await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });
    await userEvent.click(item);

    expect(await screen.findByRole("alert")).toHaveTextContent("That did not save");
    expect(screen.getByText("0/1")).toBeInTheDocument();
  });

  it("fetches a fresh session token for every round of calls", async () => {
    const hosted = mintingSession();
    renderScreen(hosted);

    const item = await screen.findByRole("checkbox", { name: "Reread the reeds ambush" });
    expect(hosted.minted()).toBe(1);

    // Hosted session tokens live 60 seconds. A token read once at mount works
    // until the first refresh and then 401s silently, so the write must reach
    // for a new one rather than reuse the one the load used.
    await userEvent.click(item);
    await waitFor(() => expect(hosted.minted()).toBe(2));

    const patch = calls.find((call) => call.method === "PATCH");
    expect(patch?.authorization).toBe("Bearer session-token-2");
  });

  it("falls back to the pasted machine token when nobody is signed in", async () => {
    window.localStorage.setItem("taverns.token", "a-machine-token");
    renderScreen();

    await screen.findByRole("heading", { name: "The Salt Road" });
    expect(calls[0]?.authorization).toBe("Bearer a-machine-token");
  });

  it("says what to do when there is no credential at all", async () => {
    routes.set(`GET /campaigns/${campaignId}`, {
      status: 401,
      body: { _tag: "Unauthorized", message: "no token" },
    });
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("No credential yet");
    // The unconfigured branch: this is a normal way to run the app, so it points
    // at the machine token rather than a sign-in that does not exist here.
    expect(screen.getByText(/pnpm -F server token:issue/)).toBeInTheDocument();
  });

  it("tells a transport failure apart from a refusal", async () => {
    transportDown = true;
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("The server did not answer");
    expect(screen.getByText(/pnpm db:up/)).toBeInTheDocument();
  });

  it("draws the empty states a brand-new campaign lands on", async () => {
    routes.set(`GET /campaigns/${campaignId}`, {
      status: 200,
      body: { ...campaign, name: "The Reed Marches", partyName: null, currentSessionId: null },
    });
    routes.set(`GET /campaigns/${campaignId}/encounters`, { status: 200, body: [] });
    routes.set(`GET /campaigns/${campaignId}/notes`, { status: 200, body: [] });
    routes.set(`GET /campaigns/${campaignId}/characters`, { status: 200, body: [] });
    renderScreen(mintingSession());

    expect(await screen.findByText("No encounters yet")).toBeInTheDocument();
    // No session means no checklist to hang items on — a state, not a blank card.
    expect(screen.getByText(/The checklist belongs to the night you are preparing/)).toBeVisible();

    await userEvent.click(screen.getByRole("tab", { name: "Notes" }));
    expect(await screen.findByText("No notes yet")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Party" }));
    expect(await screen.findByText("Nobody at the table yet")).toBeInTheDocument();
  });

  it("filters what is on screen without moving a card's own note count", async () => {
    renderScreen(mintingSession());

    const search = await screen.findByRole("textbox", { name: "Search this campaign" });
    await userEvent.type(search, "crate");

    expect(screen.queryByText("Ambush in the reeds")).not.toBeInTheDocument();
    expect(screen.getByText("Whatever is in the crate")).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "nothing by that name");

    // Searching to nothing is not the same state as having nothing, and says so.
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    expect(screen.getByText(/Loosen the search, or clear it/)).toBeInTheDocument();
  });
});
