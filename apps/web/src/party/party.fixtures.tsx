import { HostedSessionScope } from "../auth/AuthProvider";
import { renderAt } from "../test/renderRoute";
import { vi } from "vitest";
import { type HostedSession } from "../auth/hostedSession";
import {
  campaignId,
  character,
  characterSeat,
  dmAccountId,
  dmMember,
  fullCampaign,
  worldId,
  ilseAccountId,
  partySeat,
  type Answer,
  type Call,
} from "../campaign/campaign.fixtures";

/**
 * The party screen's test wire.
 *
 * The campaign, the shared character and its seat come from
 * `campaign/campaign.fixtures.tsx`, for the reason that file exists — a field
 * renamed upstream is one edit and not two. What is new here is the roster's
 * own half: members, invitations, and the extra seats a populated table holds.
 *
 * Under the continuity decision of 2026-09-01 there is no assignment any more —
 * a character is its owner's, seated by its owner — so what used to be "spare
 * characters waiting to be given out" are now simply more seats, each with an
 * owner. Kofi is the `no-character` member precisely because **no seat names
 * him**, which is the whole derivation now.
 *
 * **The bodies are the JSON the server sends**, not the decoded classes, so a
 * contract rename fails decoding rather than rendering `undefined`.
 */

export {
  campaign,
  campaignId,
  characterSeat,
  dmAccountId,
  dmMember,
  ilseAccountId,
  partySeat,
  seatId,
} from "../campaign/campaign.fixtures";

const base = `/campaigns/${campaignId}`;

export const kofiAccountId = "2b1f2a1e-0000-4000-8000-0000000000a3";

export const inviteId = "2b1f2a1e-0000-4000-8000-0000000000e1";

/** A player with a character: the `playing` row. */
export const ilse = {
  accountId: ilseAccountId,
  name: "Ilse Vantar",
  relation: "player",
  joinedAt: "2026-07-02T10:00:00.000Z",
};

/** A player with none: the `no-character` row, and the whole point of the screen. */
export const kofi = {
  accountId: kofiAccountId,
  name: "Kofi Adeyemi",
  relation: "player",
  joinedAt: "2026-07-09T10:00:00.000Z",
};

/** Ilse's character — `character` is already hers in the shared fixture. */
export const brannocOwned = character;

/** Brannoc's seat with the shared character behind it: the `playing` proof. */
export const brannocSeat = partySeat;

/**
 * The creator's own character, seated — a creator is a player too under the
 * continuity decision, which is what replaced the old "unassigned spare": a
 * character with no owner is not representable any more (`account_id` is
 * `not null`), so every seat here names whose it is.
 */
export const sorrelCharacter = {
  ...character,
  id: "2b1f2a1e-0000-4000-8000-000000000902",
  accountId: dmAccountId,
  name: "Sorrel Ash",
  playerName: null,
  level: 1,
  race: "Elf",
  className: "Ranger",
  descriptor: "Level 1 Elf Ranger",
  hpCurrent: null,
};

export const sorrelSeatId = "2b1f2a1e-0000-4000-8000-000000000952";

export const sorrelSeat = {
  seat: {
    ...characterSeat,
    id: sorrelSeatId,
    characterId: sorrelCharacter.id,
    accountId: dmAccountId,
    displayName: "Sorrel Ash",
  },
  character: sorrelCharacter,
};

/**
 * A third seated character, so the party has a middle level at all.
 *
 * Two characters have no median worth naming — see `needsOf` — so a fixture with
 * only Brannoc and Sorrel could never draw the levelling line, and the screen's
 * *Needs you* would be pinned one nudge short of what it renders.
 */
export const pellCharacter = {
  ...sorrelCharacter,
  id: "2b1f2a1e-0000-4000-8000-000000000903",
  name: "Pell",
  level: 3,
  race: "Human",
  className: "Cleric",
  descriptor: "Level 3 Human Cleric",
};

export const pellSeatId = "2b1f2a1e-0000-4000-8000-000000000953";

export const pellSeat = {
  seat: {
    ...characterSeat,
    id: pellSeatId,
    characterId: pellCharacter.id,
    accountId: dmAccountId,
    displayName: "Pell",
  },
  character: pellCharacter,
};

/**
 * A live invitation, minted long enough ago to be one of *Needs you*'s lines
 * whatever day the suite runs. The freshly-minted case is unit-tested in
 * `roster.test.ts`, where the clock is an argument.
 */
export const liveInvite = {
  id: inviteId,
  worldId,
  campaignId,
  label: "Hal",
  status: "live",
  expiresAt: "2099-01-14T10:00:00.000Z",
  revokedAt: null,
  redeemedAt: null,
  redeemedByName: null,
  createdAt: "2026-01-01T10:00:00.000Z",
};

/** Spent, so it is a member and must not appear in the roster a second time. */
export const takenInvite = {
  ...liveInvite,
  id: "2b1f2a1e-0000-4000-8000-0000000000e2",
  label: "Ilse",
  status: "redeemed",
  redeemedAt: "2026-07-02T10:00:00.000Z",
  redeemedByName: "Ilse Vantar",
};

/**
 * A table with a DM, two players and somebody invited.
 *
 * **Built on `fullCampaign()` rather than beside it**, because the party is one
 * of the campaign's destinations and wears `CampaignChrome` — so the screen
 * makes every read the frame does, and a map that answered only the roster's
 * three would 404 the campaign out from under it. The overrides below are the
 * roster's own half: this file's members, invitations and seats in place of
 * the shared fixture's, plus the seat verbs and the invitation writes.
 */
export const fullParty = (): Map<string, Answer> => {
  const routes = fullCampaign();
  routes.set(`GET ${base}/members`, { status: 200, body: [dmMember, ilse, kofi] });
  routes.set(`GET ${base}/invites`, { status: 200, body: [liveInvite, takenInvite] });
  routes.set(`GET ${base}/party`, {
    status: 200,
    body: [brannocSeat, sorrelSeat, pellSeat],
  });
  // The creator's two seat verbs, on Brannoc's seat: sharing it with the
  // table, and retiring it. Both answers are what the server would say; what a
  // test asserts is the request each button makes and the re-read that follows.
  routes.set(`PATCH ${base}/party/${brannocSeat.seat.id}`, {
    status: 200,
    body: { ...brannocSeat, seat: { ...brannocSeat.seat, visibility: "shared" } },
  });
  routes.set(`DELETE ${base}/party/${sorrelSeatId}`, { status: 204, body: undefined });
  routes.set(`POST ${base}/invites`, {
    status: 200,
    body: { invite: liveInvite, token: "a-token" },
  });
  routes.set(`POST ${base}/invites/${inviteId}/revoke`, {
    status: 200,
    body: { ...liveInvite, status: "revoked", revokedAt: "2026-08-13T10:00:00Z" },
  });
  return routes;
};

/** A campaign nobody has joined and nobody has been invited to. */
export const emptyParty = (): Map<string, Answer> => {
  const routes = fullParty();
  routes.set(`GET ${base}/members`, { status: 200, body: [dmMember] });
  routes.set(`GET ${base}/invites`, { status: 200, body: [] });
  routes.set(`GET ${base}/party`, { status: 200, body: [] });
  return routes;
};

export interface PartyStubServer {
  routes: Map<string, Answer>;
  readonly calls: Array<Call>;
  transportDown: boolean;
  readonly reset: () => void;
}

/**
 * Installs the one `fetch` stub this file's tests get — **once per test file, at
 * module scope**, for the `Context.Reference` reason `api/client.test.ts`
 * records.
 */
export const installPartyServer = (): PartyStubServer => {
  const server: PartyStubServer = {
    routes: fullParty(),
    calls: [],
    transportDown: false,
    reset: () => {
      server.routes = fullParty();
      server.calls.length = 0;
      server.transportDown = false;
    },
  };

  vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
    if (server.transportDown) return Promise.reject(new TypeError("Failed to fetch"));

    const { pathname, search } = new URL(String(url));
    const method = init?.method ?? "GET";
    const headers = init?.headers as Record<string, string> | undefined;
    server.calls.push({
      method,
      pathname,
      search,
      authorization: headers?.["authorization"],
      body: init?.body === undefined ? "" : new TextDecoder().decode(init.body as Uint8Array),
    });

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

export const noSession: HostedSession = {
  configured: false,
  signedIn: false,
  loading: false,
  fetchToken: () => Promise.resolve(undefined),
};

/** Annotated `void` — Testing Library's `RenderResult` is not nameable here. */
export const renderParty = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/party`, (screen) => (
    <HostedSessionScope session={noSession}>{screen}</HostedSessionScope>
  ));
};
