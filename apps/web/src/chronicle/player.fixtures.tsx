import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { vi } from "vitest";
import { NO_HOSTED_SESSION } from "../auth/hostedSession";
import {
  beat,
  campaign,
  campaignId,
  carriedRun,
  readAloudNote,
  resumedRun,
  session11Id,
  session12Id,
  sessions,
  type Answer,
  type Call,
} from "./chronicle.fixtures";

/**
 * The player Chronicle's wire — **the DM's fixtures, narrowed exactly where the
 * projection narrows and nowhere else.**
 *
 * The campaign, both nights and both halves of the carried fight are imported
 * from `chronicle.fixtures.tsx` rather than restated, which is the point: the
 * two screens read one record, and a second set of nights could drift into
 * telling a different story about the same rounds. What is written here is the
 * one thing that genuinely differs — `PlayerSessionRecap`'s combatants.
 *
 * Bodies are the JSON the server sends, so `PlayerCombatant`'s union has to
 * decode. A monster fixture carrying an `ac` would be *refused* here rather than
 * quietly rendered, which is what makes "there is no armour class in this
 * projection" a measurement.
 */

export { campaignId, session11Id, session12Id };

/**
 * Somebody at the table: exact hit points, on purpose. The party already reads
 * this number out loud.
 */
export const brannoc = {
  kind: "pc",
  id: "2b1f2a1e-0000-4000-8000-000000000d01",
  encounterRunId: carriedRun.id,
  displayName: "Brannoc",
  subtitle: "Half-orc paladin",
  playerName: "Ilse",
  initiative: 21,
  conditions: [],
  hpCurrent: 6,
  hpMax: 52,
};

/**
 * What the DM was running: a band, and **no field for an armour class or a
 * total.** `PlayerRecap.ts` leaves both off the type rather than nullable, so
 * this object is the whole of what a player is told about her.
 */
export const marshHag = {
  kind: "npc",
  id: "2b1f2a1e-0000-4000-8000-000000000d02",
  encounterRunId: carriedRun.id,
  displayName: "Marsh Hag",
  subtitle: "Medium fey",
  playerName: null,
  initiative: 14,
  conditions: ["Legendary"],
  hpBand: "bloodied",
};

/** A monster the night finished. */
export const reedStalker = {
  kind: "npc",
  id: "2b1f2a1e-0000-4000-8000-000000000d03",
  encounterRunId: carriedRun.id,
  displayName: "Reed Stalker",
  subtitle: "Small beast",
  playerName: null,
  initiative: 9,
  conditions: [],
  hpBand: "down",
};

/** Session 11, as a player is told it: the fight that paused, and the prose. */
export const playerRecap11 = {
  session: sessions[1],
  fights: [
    {
      run: carriedRun,
      combatants: [brannoc, marshHag, reedStalker],
      continuedFrom: null,
      // Where the fight has got to *since*, on the far night — not the round it
      // paused at here.
      continuedInto: {
        runId: resumedRun.id,
        sessionId: session12Id,
        sessionNumber: 12,
        round: 7,
      },
    },
  ],
  beats: [beat],
  prepDone: [],
  notes: [readAloudNote],
};

/** Session 12, from the far side of the join. */
export const playerRecap12 = {
  session: sessions[0],
  fights: [
    {
      run: resumedRun,
      combatants: [],
      // The predecessor's frozen round — the round the fight paused on.
      continuedFrom: {
        runId: carriedRun.id,
        sessionId: session11Id,
        sessionNumber: 11,
        round: 4,
      },
      continuedInto: null,
    },
  ],
  beats: [],
  prepDone: [],
  notes: [],
};

/** Two shared nights and the fight across both, as `recap/player` answers them. */
const sharedRecord = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET /campaigns/${campaignId}`, { status: 200, body: campaign }],
    [`GET /campaigns/${campaignId}/sessions`, { status: 200, body: sessions }],
    [
      `GET /campaigns/${campaignId}/sessions/${session11Id}/recap/player`,
      { status: 200, body: playerRecap11 },
    ],
    [
      `GET /campaigns/${campaignId}/sessions/${session12Id}/recap/player`,
      { status: 200, body: playerRecap12 },
    ],
  ]);

export interface StubServer {
  routes: Map<string, Answer>;
  readonly calls: Array<Call>;
  readonly reset: () => void;
}

/**
 * One `fetch` stub per file, at module scope — `FetchHttpClient.Fetch` is a
 * `Context.Reference` and `Context` memoises its default on first read, so a
 * per-test `vi.stubGlobal` keeps serving the first test's answers.
 */
export const installPlayerChronicleServer = (): StubServer => {
  const server: StubServer = {
    routes: sharedRecord(),
    calls: [],
    reset: () => {
      server.routes = sharedRecord();
      server.calls.length = 0;
    },
  };

  vi.stubGlobal("fetch", (url: string | URL) => {
    const { pathname, search } = new URL(String(url));
    server.calls.push({ method: "GET", pathname, search });
    const answer = server.routes.get(`GET ${pathname}`) ?? {
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

  return server;
};

/** Annotated `void` — Testing Library's `RenderResult` is not nameable here (TS2742). */
export const renderPlayerChronicle = async (): Promise<void> => {
  await renderAt(`/play/campaigns/${campaignId}/chronicle`, (screen) => (
    <HostedSessionScope session={NO_HOSTED_SESSION}>{screen}</HostedSessionScope>
  ));
};
