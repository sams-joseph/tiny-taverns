import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { CampaignId } from "@taverns/api";
import { Schema } from "effect";
import { vi } from "vitest";
import { page } from "../campaign/campaign.fixtures";
import { chronicleNightId } from "../test/ids";
import { TEST_SESSION } from "../test/session";

/**
 * The Chronicle's test wire: two nights, one fight that crosses them, and a
 * stub server.
 *
 * **The bodies are the JSON the server sends, not the decoded classes** — the
 * rule `campaign/campaign.fixtures.tsx` exists for, so a field the contract
 * renames fails decoding here rather than rendering `undefined`. Which matters
 * more on this screen than anywhere else: the whole point of `RecapRunLink` is
 * two rounds that mean different things, and a fixture that quietly dropped one
 * would leave the assertion about them passing over nothing.
 *
 * The two nights are deliberately shaped so the carried fight's **two rounds
 * differ**: it paused at round 4 on session 11 and has since reached round 7 on
 * session 12. An assertion written against a fixture where both were 4 would
 * hold whichever number the screen picked.
 */

export const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
export const session11Id = chronicleNightId;
export const session12Id = "2b1f2a1e-0000-4000-8000-000000000512";
export const run11Id = "2b1f2a1e-0000-4000-8000-000000000c11";
export const run12Id = "2b1f2a1e-0000-4000-8000-000000000c12";
export const beatId = "2b1f2a1e-0000-4000-8000-000000000e01";
export const sharedBeatId = "2b1f2a1e-0000-4000-8000-000000000e02";
export const bridgeRunId = "2b1f2a1e-0000-4000-8000-000000000c13";
export const bridgeEncounterId = "2b1f2a1e-0000-4000-8000-000000000613";
export const noteId = "2b1f2a1e-0000-4000-8000-000000000801";
export const prepItemId = "2b1f2a1e-0000-4000-8000-000000000701";

const stamps = { createdAt: "2026-08-04T13:03:28.070Z", updatedAt: "2026-08-04T13:03:28.070Z" };
const provenance = { origin: "authored", assistantTurnId: null };

export const worldId = "5a1e2b3c-0000-4000-8000-00000000aaa1";
export const dmAccountId = "2b1f2a1e-0000-4000-8000-00000000d000";

export const campaign = {
  id: campaignId,
  contextId: worldId,
  creatorAccountId: dmAccountId,
  name: "The Salt Road",
  partyName: "The Gilded Spoon",
  description: null,
  playerCount: 4,
  currentSessionId: session12Id,
  visibility: "dm",
  image: null,
  imagePending: false,
  archivedAt: null,
  ...provenance,
  ...stamps,
};

const night = (
  id: string,
  number: number,
  startedAt: string,
  endedAt: string | null,
  activeEncounterRunId: string | null,
) => ({
  id,
  campaignId,
  number,
  title: null,
  startedAt,
  endedAt,
  activeEncounterRunId,
  summary: null,
  summaryOrigin: null,
  summaryAssistantTurnId: null,
  spotlightSeatId: null,
  visibility: "dm",
  ...provenance,
  ...stamps,
});

/**
 * The DM's few sentences about session 11 — long enough that a closed card
 * clamps it to two lines at every width, which is what the layout checks
 * measure.
 */
export const summary11 =
  "The party crossed Grusk's toll bridge without paying, which the troll has not forgotten. " +
  "At the water the ferryman asked for a name instead of coin, and Tamsin gave him one. " +
  "The reeds closed in before anybody had a light going, and the ambush was still being " +
  "fought when the night ended — Brannoc on six hit points, holding the bank.";

/**
 * The night the fight paused on: finished, with the run carried out of it, and
 * written up by the DM.
 */
export const session11 = {
  ...night(session11Id, 11, "2026-07-19T18:00:00.000Z", "2026-07-19T22:30:00.000Z", null),
  summary: summary11,
  summaryOrigin: "authored",
};
/** The night that picked it up, and is still being prepared — nothing written up yet. */
export const session12 = night(session12Id, 12, "2026-08-02T18:00:00.000Z", null, run12Id);

/** `sessions.list` answers newest first — `session.number desc`. */
export const sessions = [session12, session11];

const run = (id: string, sessionId: string, round: number) => ({
  id,
  sessionId,
  encounterId: null,
  encounterName: "Ambush in the reeds",
  mode: "combat",
  round,
  phase: "turns",
  activeCombatantId: null,
  startedAt: "2026-07-19T20:00:00.000Z",
  endedAt: null,
  endedReason: "resolved",
  allowHobDirectWrites: false,
  mapShown: false,
  hostileTokensHidden: false,
  continuedFrom: null,
  visibility: "dm",
  ...provenance,
  ...stamps,
});

/** Paused at round 4 when session 11 ended. */
export const carriedRun = {
  ...run(run11Id, session11Id, 4),
  endedAt: "2026-07-19T22:30:00.000Z",
  endedReason: "carried",
};

/** The successor: still live on session 12, and it has got to round 7 since. */
export const resumedRun = { ...run(run12Id, session12Id, 7), continuedFrom: run11Id };

const combatant = {
  id: "2b1f2a1e-0000-4000-8000-000000000d01",
  encounterRunId: run11Id,
  characterId: null,
  creatureId: null,
  displayName: "Brannoc",
  subtitle: "Half-orc paladin",
  playerName: "Ilse",
  initiative: 21,
  initiativeBonus: null,
  initiativeSetBy: "dm",
  hpCurrent: 6,
  hpMax: 52,
  ac: 18,
  kind: "pc",
  conditions: [],
  visibility: "dm",
  position: null,
  portrait: null,
  ...provenance,
  ...stamps,
};

export const beat = {
  id: beatId,
  sessionId: session11Id,
  encounterRunId: run11Id,
  body: "The ferryman is called Cazril. He will not take coin, only a name.",
  visibility: "dm",
  ...provenance,
  ...stamps,
};

/** A moment the DM shared with the table, so both screens draw it as a bullet. */
export const sharedBeat = {
  ...beat,
  id: sharedBeatId,
  encounterRunId: null,
  body: "Tamsin promised the ferryman her true name on the way back.",
  visibility: "shared",
};

/**
 * A conversation played the same night as the fight that paused, with its
 * encounter still there to open — so session 11 has a chip of each kind, one
 * the DM can follow and one (the fight's, whose encounter is gone) they cannot.
 */
export const bridgeRun = {
  ...run(bridgeRunId, session11Id, 0),
  encounterId: bridgeEncounterId,
  encounterName: "Toll bridge standoff",
  mode: "social",
  startedAt: "2026-07-19T18:30:00.000Z",
  endedAt: "2026-07-19T19:10:00.000Z",
};

export const readAloudNote = {
  id: noteId,
  campaignId,
  title: "Read aloud at the water",
  body: "The reeds are taller than you are and they are not moving, even though there is a wind.",
  kind: "read_aloud",
  category: null,
  attachedTo: null,
  links: [],
  visibility: "dm",
  pinnedAt: null,
  ...provenance,
  ...stamps,
};

export const prepItem = {
  id: prepItemId,
  sessionId: session12Id,
  label: "Decide what Ovid thinks is in the crate",
  done: false,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

/**
 * Session 11's recap: a conversation, then the fight that paused, plus the
 * night's own prose — one beat kept back and one shared.
 */
export const recap11 = {
  session: session11,
  fights: [
    {
      run: bridgeRun,
      combatants: [],
      checks: [],
      scene: { challenge: null, attitude: null, stage: null, stages: null },
      continuedFrom: null,
      continuedInto: null,
    },
    {
      run: carriedRun,
      combatants: [combatant],
      checks: [],
      scene: null,
      continuedFrom: null,
      // The successor's round at read time — where the fight has got to *since*,
      // and emphatically not the round it paused at.
      continuedInto: { runId: run12Id, sessionId: session12Id, sessionNumber: 12, round: 7 },
    },
  ],
  beats: [beat, sharedBeat],
  prepDone: [
    {
      ...prepItem,
      id: "2b1f2a1e-0000-4000-8000-000000000702",
      done: true,
      sessionId: session11Id,
      label: "Pick a name for the ferryman",
    },
  ],
  notes: [readAloudNote],
};

/** Session 12's recap: the same fight, from the far side of the join. */
export const recap12 = {
  session: session12,
  fights: [
    {
      run: resumedRun,
      combatants: [],
      checks: [],
      scene: null,
      // The predecessor's frozen round — the round the fight paused on.
      continuedFrom: { runId: run11Id, sessionId: session11Id, sessionNumber: 11, round: 4 },
      continuedInto: null,
    },
  ],
  beats: [],
  prepDone: [],
  notes: [],
};

/**
 * The whole record, as `GET …/chronicle` answers it: newest first, each night's
 * runs and beats oldest first — the same rows its recap carries.
 */
export const chronicle = [
  { session: session12, runs: [resumedRun], beats: [] },
  { session: session11, runs: [bridgeRun, carriedRun], beats: [beat, sharedBeat] },
];

export const saltRoadActId = "2b1f2a1e-0000-4000-8000-000000000a12";

/**
 * The act session 12 starts, kept to the DM — so the newest night reads under
 * a heading and session 11, older than every act, reads under none and can
 * start one.
 */
export const saltRoad = {
  id: saltRoadActId,
  campaignId,
  title: "Act II · The salt road",
  firstSessionNumber: 12,
  visibility: "dm",
  ...provenance,
  ...stamps,
};

export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

export interface Call {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
  /** The JSON a write sent, decoded; undefined for a read. */
  readonly body?: unknown;
}

/** One server-sent event, as `POST …/hob/ask` streams it. */
export interface Frame {
  readonly event: string;
  readonly data: unknown;
}

/**
 * A campaign with two nights on the record and a fight across both.
 *
 * **The first six are `CampaignChrome`'s, not the Chronicle's.** The screen is
 * one of the campaign's destinations and wears the shared frame — which is what
 * gives it the session badge and the campaign action it used to draw neither of
 * — so it makes the frame's reads too. They are spelled out here rather than
 * borrowed from `campaign/campaign.fixtures.tsx`'s `fullCampaign()` because this
 * file's campaign is a *different* one: two nights, and a fight that crosses
 * them, which is the whole point of the fixture and is not what the shared one
 * describes. The empty lists are honest — nothing on this screen draws an
 * encounter, a note or a character.
 */
export const fullChronicle = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET /campaigns/${campaignId}`, { status: 200, body: campaign }],
    [
      "GET /me/campaigns",
      {
        status: 200,
        body: [{ campaign, relation: "creator", sharedWorld: null, joinedAt: stamps.createdAt }],
      },
    ],
    [`GET /campaigns/${campaignId}/encounters`, { status: 200, body: page([]) }],
    [`GET /campaigns/${campaignId}/notes`, { status: 200, body: page([]) }],
    [`GET /campaigns/${campaignId}/party`, { status: 200, body: [] }],
    // The night being prepared, which the campaign row names in its badge.
    [`GET /campaigns/${campaignId}/sessions/${session12Id}`, { status: 200, body: session12 }],
    // The fight session 12 picked up is still on the table, so the campaign
    // action reads *Back to the fight* — the same run `recap12` links to.
    [
      `GET /campaigns/${campaignId}/sessions/${session12Id}/runs`,
      { status: 200, body: [resumedRun] },
    ],
    [`GET /campaigns/${campaignId}/sessions`, { status: 200, body: sessions }],
    [`GET /campaigns/${campaignId}/chronicle`, { status: 200, body: chronicle }],
    [`GET /campaigns/${campaignId}/acts`, { status: 200, body: [saltRoad] }],
    [
      `GET /campaigns/${campaignId}/sessions/${session12Id}/prep`,
      { status: 200, body: [prepItem] },
    ],
    [`GET /campaigns/${campaignId}/sessions/${session11Id}/recap`, { status: 200, body: recap11 }],
    [`GET /campaigns/${campaignId}/sessions/${session12Id}/recap`, { status: 200, body: recap12 }],
    // A model is behind Hob, so the composer offers *Ask Hob to draft*.
    [
      `GET /campaigns/${campaignId}/hob`,
      { status: 200, body: { available: true, model: "scripted", campaign: campaign.name } },
    ],
  ]);

export interface StubServer {
  /** Keyed `METHOD /path`. A write with no route answers 404. */
  routes: Map<string, Answer>;
  /** What `POST …/hob/ask` streams, in order, before closing. */
  frames: Array<Frame>;
  readonly calls: Array<Call>;
  readonly reset: () => void;
}

/**
 * Installs the one `fetch` stub this file's tests get — **once per test file, at
 * module scope**. `FetchHttpClient.Fetch` is a `Context.Reference` and `Context`
 * memoises a reference's default on first read, so a per-test `vi.stubGlobal`
 * keeps serving the first test's answers with nothing to notice.
 */
export const installChronicleServer = (): StubServer => {
  const server: StubServer = {
    routes: fullChronicle(),
    frames: [],
    calls: [],
    reset: () => {
      server.routes = fullChronicle();
      server.frames = [];
      server.calls.length = 0;
    },
  };
  const encoder = new TextEncoder();

  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => {
    const { pathname, search } = new URL(String(url));
    const method = init?.method ?? "GET";
    const sent =
      init?.body === undefined || init.body === null
        ? undefined
        : JSON.parse(
            typeof init.body === "string"
              ? init.body
              : new TextDecoder().decode(init.body as Uint8Array),
          );
    server.calls.push({ method, pathname, search, body: sent });

    if (method === "POST" && pathname.endsWith("/hob/ask")) {
      const frames = server.frames;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const frame of frames)
            controller.enqueue(
              encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`),
            );
          controller.close();
        },
      });
      return Promise.resolve(
        new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } }),
      );
    }

    const answer = server.routes.get(`${method} ${pathname}`) ?? {
      status: 404,
      body: { _tag: "NotFound", resource: "campaign", id: campaignId },
    };
    return Promise.resolve(
      new Response(answer.status === 204 ? null : JSON.stringify(answer.body), {
        status: answer.status,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  return server;
};

/** Annotated `void` — Testing Library's `RenderResult` is not nameable here (TS2742). */
export const renderChronicle = async (search = ""): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/chronicle${search}`, (screen) => (
    <HostedSessionScope session={TEST_SESSION}>{screen}</HostedSessionScope>
  ));
};
