import { CampaignId } from "@taverns/api";
import { render } from "@testing-library/react";
import { Schema } from "effect";
import { vi } from "vitest";
import { HostedSessionContext, NO_HOSTED_SESSION } from "../auth/hostedSession";
import { ChronicleScreen } from "./ChronicleScreen";

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
export const session11Id = "2b1f2a1e-0000-4000-8000-000000000511";
export const session12Id = "2b1f2a1e-0000-4000-8000-000000000512";
export const run11Id = "2b1f2a1e-0000-4000-8000-000000000c11";
export const run12Id = "2b1f2a1e-0000-4000-8000-000000000c12";
export const beatId = "2b1f2a1e-0000-4000-8000-000000000e01";
export const noteId = "2b1f2a1e-0000-4000-8000-000000000801";
export const creatureId = "2b1f2a1e-0000-4000-8000-000000000a01";
export const prepItemId = "2b1f2a1e-0000-4000-8000-000000000701";

const stamps = { createdAt: "2026-08-04T13:03:28.070Z", updatedAt: "2026-08-04T13:03:28.070Z" };
const provenance = { origin: "authored", assistantTurnId: null };

export const campaign = {
  id: campaignId,
  name: "The Salt Road",
  partyName: "The Gilded Spoon",
  playerCount: 4,
  currentSessionId: session12Id,
  visibility: "dm",
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
  visibility: "dm",
  ...provenance,
  ...stamps,
});

/** The night the fight paused on: finished, with the run carried out of it. */
export const session11 = night(
  session11Id,
  11,
  "2026-07-19T18:00:00.000Z",
  "2026-07-19T22:30:00.000Z",
  null,
);
/** The night that picked it up, and is still being prepared. */
export const session12 = night(session12Id, 12, "2026-08-02T18:00:00.000Z", null, run12Id);

/** `sessions.list` answers newest first — `session.number desc`. */
export const sessions = [session12, session11];

const run = (id: string, sessionId: string, round: number) => ({
  id,
  sessionId,
  encounterId: null,
  encounterName: "Ambush in the reeds",
  round,
  activeCombatantId: null,
  startedAt: "2026-07-19T20:00:00.000Z",
  endedAt: null,
  endedReason: "resolved",
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
  hpCurrent: 6,
  hpMax: 52,
  ac: 18,
  kind: "pc",
  conditions: [],
  visibility: "dm",
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

export const readAloudNote = {
  id: noteId,
  campaignId,
  title: "Read aloud at the water",
  body: "The reeds are taller than you are and they are not moving, even though there is a wind.",
  kind: "read_aloud",
  attachedTo: null,
  visibility: "dm",
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

/** Session 11's recap: the fight that paused, plus the night's own prose. */
export const recap11 = {
  session: session11,
  fights: [
    {
      run: carriedRun,
      combatants: [combatant],
      continuedFrom: null,
      // The successor's round at read time — where the fight has got to *since*,
      // and emphatically not the round it paused at.
      continuedInto: { runId: run12Id, sessionId: session12Id, sessionNumber: 12, round: 7 },
    },
  ],
  beats: [beat],
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
      // The predecessor's frozen round — the round the fight paused on.
      continuedFrom: { runId: run11Id, sessionId: session11Id, sessionNumber: 11, round: 4 },
      continuedInto: null,
    },
  ],
  beats: [],
  prepDone: [],
  notes: [],
};

export const hits = [
  {
    source: "beat",
    id: beatId,
    sessionId: session11Id,
    rank: 0.6,
    snippet: "The ferryman is called Cazril. He will not take coin",
    ...stamps,
  },
  {
    source: "note",
    id: noteId,
    title: "Read aloud at the water",
    rank: 0.3,
    // Deliberately carries characters that would be markup if anything parsed
    // it: the API promises plain text and this is how the screen proves it.
    snippet: "the ferryman <b>waits</b> where the reeds stop",
    ...stamps,
  },
  {
    source: "creature",
    id: creatureId,
    title: "Ferryman of the Reeds",
    rank: 0.1,
    snippet: "Medium undead, neutral evil",
    ...stamps,
  },
];

export interface Answer {
  readonly status: number;
  readonly body: unknown;
}

export interface Call {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
}

/** A campaign with two nights on the record and a fight across both. */
export const fullChronicle = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET /campaigns/${campaignId}`, { status: 200, body: campaign }],
    [`GET /campaigns/${campaignId}/sessions`, { status: 200, body: sessions }],
    [
      `GET /campaigns/${campaignId}/sessions/${session12Id}/prep`,
      { status: 200, body: [prepItem] },
    ],
    [`GET /campaigns/${campaignId}/sessions/${session11Id}/recap`, { status: 200, body: recap11 }],
    [`GET /campaigns/${campaignId}/sessions/${session12Id}/recap`, { status: 200, body: recap12 }],
    [`GET /campaigns/${campaignId}/search`, { status: 200, body: hits }],
  ]);

export interface StubServer {
  routes: Map<string, Answer>;
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
    calls: [],
    reset: () => {
      server.routes = fullChronicle();
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
export const renderChronicle = (): void => {
  render(
    <HostedSessionContext value={NO_HOSTED_SESSION}>
      <ChronicleScreen campaignId={campaignId} route={{ screen: "chronicle", campaignId }} />
    </HostedSessionContext>,
  );
};
