import { HostedSessionScope } from "../auth/AuthProvider";
import { vi } from "vitest";
import { type HostedSession } from "../auth/hostedSession";
import {
  bloodswornOption,
  bloodswornOriginalId,
  campaignId,
  druidOption,
  fullCampaign,
  libraryOptions,
  marshfolkOption,
  marshfolkOriginalId,
  saltRunnerOption,
  saltRunnerOriginalId,
  type Answer,
  type Call,
} from "../campaign/campaign.fixtures";
import { renderAt } from "../test/renderRoute";

/**
 * The Rules screen's test wire.
 *
 * The vocabulary itself comes from `campaign/campaign.fixtures.tsx` — the same
 * `campaignOptions` and `libraryOptions` the create form's tests read — for the
 * reason that file exists: **one answer to what this table offers**, so a field
 * renamed upstream is one edit and the DM's screen and the player's picker
 * cannot come to disagree about what a class is.
 *
 * **The bodies are the JSON the server sends**, not the decoded union, so a
 * contract rename fails decoding rather than rendering nothing.
 */

export {
  bloodswornOption,
  bloodswornOptionId,
  bloodswornOriginalId,
  campaign,
  campaignId,
  campaignOptions,
  druidOption,
  druidOptionId,
  libraryOptions,
  marshfolkOption,
  marshfolkOptionId,
  marshfolkOriginalId,
  saltRunnerOption,
  saltRunnerOptionId,
  saltRunnerOriginalId,
} from "../campaign/campaign.fixtures";

const base = `/campaigns/${campaignId}`;

const libraryDruidOption =
  libraryOptions.find((option) => option.kind === "class" && option.name === "Druid") ??
  druidOption;
export const libraryDruidOptionId = libraryDruidOption.id;

const progressionFields = {
  visibility: "shared",
  origin: "system",
  assistantTurnId: null,
  createdAt: "2026-08-04T13:03:28.070Z",
  updatedAt: "2026-08-04T13:03:28.070Z",
};

export const druidProgression = {
  option: {
    ...libraryDruidOption,
    body: { ...libraryDruidOption.body, subclassCount: 1, levelCount: 2, featureCount: 2 },
  },
  subclasses: [
    {
      ...progressionFields,
      id: "2b1f2a1e-0000-4000-8000-000000002001",
      campaignId: null,
      accountId: null,
      derivedFrom: null,
      classOptionId: libraryDruidOptionId,
      name: "Land",
      flavor: "Druid Circle",
      body: { desc: ["Mystics and sages who safeguard ancient knowledge."] },
    },
  ],
  levels: [
    {
      ...progressionFields,
      id: "2b1f2a1e-0000-4000-8000-000000002101",
      campaignId: null,
      accountId: null,
      derivedFrom: null,
      classOptionId: libraryDruidOptionId,
      subclassId: null,
      level: 1,
      abilityScoreBonuses: null,
      proficiencyBonus: 2,
      body: { features: [{ index: "druidic", name: "Druidic" }] },
    },
    {
      ...progressionFields,
      id: "2b1f2a1e-0000-4000-8000-000000002102",
      campaignId: null,
      accountId: null,
      derivedFrom: null,
      classOptionId: libraryDruidOptionId,
      subclassId: "2b1f2a1e-0000-4000-8000-000000002001",
      level: 2,
      abilityScoreBonuses: null,
      proficiencyBonus: null,
      body: { features: [{ index: "bonus-cantrip", name: "Bonus Cantrip" }] },
    },
  ],
  features: [
    {
      ...progressionFields,
      id: "2b1f2a1e-0000-4000-8000-000000002201",
      campaignId: null,
      accountId: null,
      derivedFrom: null,
      classOptionId: libraryDruidOptionId,
      subclassId: null,
      classLevelId: "2b1f2a1e-0000-4000-8000-000000002101",
      parentFeatureId: null,
      name: "Druidic",
      level: 1,
      body: { desc: ["You know Druidic."], prerequisites: [] },
    },
    {
      ...progressionFields,
      id: "2b1f2a1e-0000-4000-8000-000000002202",
      campaignId: null,
      accountId: null,
      derivedFrom: null,
      classOptionId: libraryDruidOptionId,
      subclassId: "2b1f2a1e-0000-4000-8000-000000002001",
      classLevelId: "2b1f2a1e-0000-4000-8000-000000002102",
      parentFeatureId: null,
      name: "Bonus Cantrip",
      level: 2,
      body: { desc: ["You learn one additional druid cantrip."], prerequisites: [] },
    },
  ],
};

export const bloodswornProgression = {
  option: {
    ...bloodswornOption,
    body: { ...bloodswornOption.body, subclassCount: 1, levelCount: 1, featureCount: 1 },
  },
  subclasses: [
    {
      ...progressionFields,
      origin: "authored",
      id: "2b1f2a1e-0000-4000-8000-000000002301",
      campaignId,
      accountId: null,
      derivedFrom: "2b1f2a1e-0000-4000-8000-000000002001",
      classOptionId: bloodswornOption.id,
      name: "Star oath",
      flavor: null,
      body: { desc: [] },
    },
  ],
  levels: [
    {
      ...progressionFields,
      origin: "authored",
      id: "2b1f2a1e-0000-4000-8000-000000002401",
      campaignId,
      accountId: null,
      derivedFrom: "2b1f2a1e-0000-4000-8000-000000002101",
      classOptionId: bloodswornOption.id,
      subclassId: "2b1f2a1e-0000-4000-8000-000000002301",
      level: 3,
      abilityScoreBonuses: 0,
      proficiencyBonus: 2,
      body: { features: [] },
    },
  ],
  features: [
    {
      ...progressionFields,
      origin: "authored",
      id: "2b1f2a1e-0000-4000-8000-000000002501",
      campaignId,
      accountId: null,
      derivedFrom: "2b1f2a1e-0000-4000-8000-000000002201",
      classOptionId: bloodswornOption.id,
      subclassId: "2b1f2a1e-0000-4000-8000-000000002301",
      classLevelId: "2b1f2a1e-0000-4000-8000-000000002401",
      parentFeatureId: null,
      name: "Starlit vow",
      level: 3,
      body: { desc: [], prerequisites: [] },
    },
  ],
};

/** What a fully populated Rules screen answers, before a test re-aims it. */
export const fullRules = (): Map<string, Answer> => {
  const routes = fullCampaign();
  // The writes. Each answers the row it made, which is what `submit` resolves
  // on — nothing here reads the answer beyond checking it succeeded, but a
  // stub that answered `{}` would decode-fail rather than fail the assertion.
  routes.set("POST /library/options", {
    status: 200,
    body: { ...bloodswornOption, id: bloodswornOriginalId, campaignId: null },
  });
  routes.set(`POST ${base}/options/${bloodswornOriginalId}/derive`, {
    status: 200,
    body: bloodswornOption,
  });
  routes.set(`PATCH ${base}/options/${bloodswornOption.id}`, {
    status: 200,
    body: bloodswornOption,
  });
  // The background's pair of the two above. Its own route because the derive
  // path names the original's id, and because a test that wrote a background
  // and read back a class would prove nothing about the third kind.
  routes.set(`POST ${base}/options/${saltRunnerOriginalId}/derive`, {
    status: 200,
    body: saltRunnerOption,
  });
  routes.set(`PATCH ${base}/options/${marshfolkOption.id}`, {
    status: 200,
    body: { ...marshfolkOption, visibility: "shared" },
  });
  routes.set(`DELETE ${base}/options/${bloodswornOption.id}`, { status: 204, body: null });
  routes.set(`GET ${base}/options/${libraryDruidOptionId}/progression`, {
    status: 200,
    body: druidProgression,
  });
  routes.set(`GET ${base}/options/${bloodswornOption.id}/progression`, {
    status: 200,
    body: bloodswornProgression,
  });

  // The Library's own writes, which name no campaign at all. Both screens over
  // this table share one wire because they share one read — a class written on
  // either is on the other — so a test of one can assert that the other's paths
  // were *not* touched.
  routes.set(`PATCH /library/options/${bloodswornOriginalId}`, {
    status: 200,
    body: { ...bloodswornOption, id: bloodswornOriginalId, campaignId: null },
  });
  routes.set(`DELETE /library/options/${marshfolkOriginalId}`, { status: 204, body: null });
  routes.set(`GET /library/options/${libraryDruidOptionId}/progression`, {
    status: 200,
    body: druidProgression,
  });
  return routes;
};

export interface RulesStubServer {
  routes: Map<string, Answer>;
  readonly calls: Array<Call>;
  transportDown: boolean;
  readonly reset: () => void;
}

/**
 * Installs the one `fetch` stub this file's tests get.
 *
 * **Once per test file, at module scope**, for the `Context.Reference` reason
 * `api/client.test.ts` records: a per-test `vi.stubGlobal` would keep serving
 * the first test's answers with nothing to notice.
 */
export const installRulesServer = (): RulesStubServer => {
  const server: RulesStubServer = {
    routes: fullRules(),
    calls: [],
    transportDown: false,
    reset: () => {
      server.routes = fullRules();
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
export const renderRules = async (): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/rules`, (screen) => (
    <HostedSessionScope session={noSession}>{screen}</HostedSessionScope>
  ));
};

/**
 * The other screen over the same table: **the account's own library**, in no
 * campaign.
 *
 * The same wire, deliberately — the two screens read one atom and one endpoint
 * between them, so a fixture that gave each its own server would let the two
 * come to disagree about what a class is in exactly the place the model says
 * they cannot.
 */
export const renderOptionLibrary = async (): Promise<void> => {
  await renderAt("/library/rules", (screen) => (
    <HostedSessionScope session={noSession}>{screen}</HostedSessionScope>
  ));
};
