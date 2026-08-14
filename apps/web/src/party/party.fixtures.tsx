import { renderAt } from "../test/renderRoute";
import { vi } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import {
  campaign,
  campaignId,
  character,
  dmMember,
  type Answer,
  type Call,
} from "../campaign/campaign.fixtures";

/**
 * The party screen's test wire.
 *
 * The campaign and the character come from `campaign/campaign.fixtures.tsx`, for
 * the reason that file exists — a field renamed upstream is one edit and not
 * two. What is new here is the roster's own half: members, invitations, and the
 * assignment that joins a character to an account.
 *
 * **The bodies are the JSON the server sends**, not the decoded classes, so a
 * contract rename fails decoding rather than rendering `undefined`.
 */

export { campaign, campaignId, dmAccountId, dmMember } from "../campaign/campaign.fixtures";

const base = `/campaigns/${campaignId}`;

export const ilseAccountId = "2b1f2a1e-0000-4000-8000-0000000000a2";
export const kofiAccountId = "2b1f2a1e-0000-4000-8000-0000000000a3";

export const inviteId = "2b1f2a1e-0000-4000-8000-0000000000e1";

/** A player with a character: the `playing` row. */
export const ilse = {
  accountId: ilseAccountId,
  name: "Ilse Vantar",
  role: "player",
  joinedAt: "2026-07-02T10:00:00.000Z",
};

/** A player with none: the `no-character` row, and the whole point of the screen. */
export const kofi = {
  accountId: kofiAccountId,
  name: "Kofi Adeyemi",
  role: "player",
  joinedAt: "2026-07-09T10:00:00.000Z",
};

/** `character`, assigned — which is what `playing` means. */
export const brannocOwned = { ...character, accountId: ilseAccountId };

/** Nobody holds this one, so it is what `AssignDialog` offers. */
export const spareCharacter = {
  ...character,
  id: "2b1f2a1e-0000-4000-8000-000000000902",
  accountId: null,
  name: "Sorrel Ash",
  playerName: null,
  level: 1,
  species: "Elf",
  className: "Ranger",
  descriptor: "Level 1 Elf Ranger",
  hpCurrent: null,
};

/**
 * A third character, so the party has a middle level at all.
 *
 * Two characters have no median worth naming — see `needsOf` — so a fixture with
 * only Brannoc and Sorrel could never draw the levelling line, and the screen's
 * *Needs you* would be pinned one nudge short of what it renders.
 */
export const secondSpare = {
  ...spareCharacter,
  id: "2b1f2a1e-0000-4000-8000-000000000903",
  name: "Pell",
  level: 3,
  species: "Human",
  className: "Cleric",
  descriptor: "Level 3 Human Cleric",
};

/**
 * A live invitation, minted long enough ago to be one of *Needs you*'s lines
 * whatever day the suite runs. The freshly-minted case is unit-tested in
 * `roster.test.ts`, where the clock is an argument.
 */
export const liveInvite = {
  id: inviteId,
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

/** A table with a DM, two players and somebody invited. */
export const fullParty = (): Map<string, Answer> =>
  new Map<string, Answer>([
    [`GET ${base}`, { status: 200, body: campaign }],
    [`GET ${base}/members`, { status: 200, body: [dmMember, ilse, kofi] }],
    [`GET ${base}/invites`, { status: 200, body: [liveInvite, takenInvite] }],
    [`GET ${base}/characters`, { status: 200, body: [brannocOwned, spareCharacter, secondSpare] }],
    [
      `POST ${base}/characters/${spareCharacter.id}/assign`,
      { status: 200, body: { ...spareCharacter, accountId: kofiAccountId } },
    ],
    [
      `POST ${base}/characters/${brannocOwned.id}/assign`,
      { status: 200, body: { ...brannocOwned, accountId: null } },
    ],
    [`POST ${base}/invites`, { status: 200, body: { invite: liveInvite, token: "a-token" } }],
    [
      `POST ${base}/invites/${inviteId}/revoke`,
      {
        status: 200,
        body: { ...liveInvite, status: "revoked", revokedAt: "2026-08-13T10:00:00Z" },
      },
    ],
  ]);

/** A campaign nobody has joined and nobody has been invited to. */
export const emptyParty = (): Map<string, Answer> => {
  const routes = fullParty();
  routes.set(`GET ${base}/members`, { status: 200, body: [dmMember] });
  routes.set(`GET ${base}/invites`, { status: 200, body: [] });
  routes.set(`GET ${base}/characters`, { status: 200, body: [] });
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
  fetchToken: () => Promise.resolve(undefined),
};

/** Annotated `void` — Testing Library's `RenderResult` is not nameable here. */
export const renderParty = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/party`, (screen) => (
    <HostedSessionContext value={noSession}>{screen}</HostedSessionContext>
  ));
};
