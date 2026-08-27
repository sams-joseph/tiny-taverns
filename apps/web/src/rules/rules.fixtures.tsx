import { HostedSessionScope } from "../auth/AuthProvider";
import { vi } from "vitest";
import { type HostedSession } from "../auth/hostedSession";
import {
  bloodswornOption,
  bloodswornOriginalId,
  campaignId,
  fullCampaign,
  marshfolkOption,
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
  libraryOptions,
  marshfolkOption,
  marshfolkOptionId,
  saltRunnerOption,
  saltRunnerOptionId,
  saltRunnerOriginalId,
} from "../campaign/campaign.fixtures";

const base = `/campaigns/${campaignId}`;

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
