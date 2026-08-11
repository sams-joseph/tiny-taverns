import { CampaignId } from "@taverns/api";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Schema } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { CampaignScreen } from "../campaign/CampaignScreen";
import {
  brannoc,
  campaignId,
  character,
  encounter,
  goblinBoss,
  liveRun,
  prepItem,
  readAloud,
  session,
  sessionId,
} from "../campaign/campaign.fixtures";
import { installRunServer, renderRunner } from "../run/run.fixtures";

/**
 * The two ways out of a night, proved to be one write.
 *
 * `run/EndRunDialog.tsx` finishes a session while a fight comes off the table;
 * `campaign/FinishSessionDialog.tsx` finishes one that never had a fight, or
 * whose fight ended an hour ago. Both go through `session/finish.ts`, and this
 * file is what says so with something other than a claim: it drives *both*
 * screens against **one** stub server and compares the requests they made.
 *
 * That is why it renders two screens from one file, which nothing else here
 * does — the property under test is a relationship between them, and a stub per
 * file could not see it. One `installRunServer()` at module scope, for the
 * `Context.Reference` reason `api/client.test.ts` records; its route map is
 * widened to answer the campaign view's reads as well.
 *
 * **A live fight no longer stops the night, and the third test below is what
 * says so.** This file used to prove the opposite: the campaign view re-read the
 * runs at submit time and refused. The captain settled that a fight carries
 * across nights, so the refusal and its tab-race re-read are gone, the server
 * ends the run as `carried` in the same transaction, and the property that
 * matters here is that finishing over a fight is *still the same single write*.
 */

const server = installRunServer();

const base = `/campaigns/${campaignId}`;
const sessionPath = `${base}/sessions/${sessionId}`;
const finished = { ...session, endedAt: "2026-08-04T23:40:00.000Z" };

/** The campaign view's reads, which the runner's fixture has no need of. */
const alsoAnswerTheCampaignView = (over: boolean) => {
  server.routes.set(`GET ${base}/encounters`, { status: 200, body: [encounter] });
  server.routes.set(`GET ${base}/notes`, { status: 200, body: [readAloud] });
  server.routes.set(`GET ${base}/characters`, { status: 200, body: [character] });
  server.routes.set(`GET ${sessionPath}`, { status: 200, body: session });
  server.routes.set(`GET ${sessionPath}/prep`, { status: 200, body: [prepItem] });
  server.routes.set(`GET ${sessionPath}/runs`, {
    status: 200,
    body: over ? [{ ...liveRun, endedAt: "2026-08-04T21:00:00.000Z" }] : [liveRun],
  });
  server.routes.set(`PATCH ${sessionPath}`, { status: 200, body: finished });
  server.routes.set(`GET ${sessionPath}/combatants`, { status: 200, body: [brannoc, goblinBoss] });
};

const noSession: HostedSession = {
  configured: false,
  signedIn: false,
  fetchToken: () => Promise.resolve(undefined),
};

const renderCampaign = (): void => {
  const id = Schema.decodeSync(CampaignId)(campaignId);
  render(
    <HostedSessionContext value={noSession}>
      <CampaignScreen campaignId={id} route={{ screen: "campaign", campaignId: id }} />
    </HostedSessionContext>,
  );
};

/** Every write the screen made against the session, in order. */
const sessionWrites = () =>
  server.calls
    .filter((call) => call.method !== "GET" && call.pathname === sessionPath)
    .map((call) => ({
      method: call.method,
      pathname: call.pathname,
      // The instant differs between two runs by construction; that it *is* an
      // instant is the part both paths have to agree on.
      body: Object.fromEntries(
        Object.entries(JSON.parse(call.body) as Record<string, unknown>).map(([field, value]) => [
          field,
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? "<an instant>" : value,
        ]),
      ),
    }));

beforeEach(() => {
  server.reset();
});

describe("finishing a session", () => {
  it("is the same write from the fight dialog and from the campaign view", async () => {
    // --- Through the fight: End, with "Finish session 12 too" switched on.
    alsoAnswerTheCampaignView(false);
    renderRunner();
    await userEvent.click(await screen.findByRole("button", { name: "End" }));
    await screen.findByText("End this fight?");
    // Base UI puts the `id` on the hidden input; the switch is the visible span.
    await userEvent.click(screen.getByRole("switch", { name: /Finish session 12 too/ }));
    await userEvent.click(screen.getByRole("button", { name: "End the fight" }));
    await waitFor(() => expect(sessionWrites()).toHaveLength(1));
    const throughTheFight = sessionWrites();

    // --- Through the campaign view, on a night whose fight is already over.
    server.reset();
    alsoAnswerTheCampaignView(true);
    renderCampaign();
    await userEvent.click(await screen.findByRole("button", { name: "Finish the night" }));
    await screen.findByText("Finish session 12?");
    await userEvent.click(screen.getByRole("button", { name: "Finish the night" }));
    await waitFor(() => expect(sessionWrites()).toHaveLength(1));
    const throughTheCampaign = sessionWrites();

    expect(throughTheCampaign).toEqual(throughTheFight);
    expect(throughTheFight[0]).toEqual({
      method: "PATCH",
      pathname: sessionPath,
      body: { endedAt: "<an instant>" },
    });
  });

  it("leaves a night that already ended alone, whichever way it is reached", async () => {
    // A night finished in another tab: both dialogs can still be opened on it,
    // and re-stamping would move the end time to now for no reason.
    alsoAnswerTheCampaignView(true);
    server.routes.set(`GET ${sessionPath}`, { status: 200, body: finished });
    renderRunner();

    await userEvent.click(await screen.findByRole("button", { name: "End" }));
    await screen.findByText("End this fight?");
    await userEvent.click(screen.getByRole("switch", { name: /Finish session 12 too/ }));
    await userEvent.click(screen.getByRole("button", { name: "End the fight" }));

    // The fight still comes off the table; only the night is left alone.
    await waitFor(() =>
      expect(server.calls.some((call) => call.pathname.endsWith("/end"))).toBe(true),
    );
    expect(sessionWrites()).toEqual([]);
  });

  it("finishes a night with a fight still on the table, in one write", async () => {
    // The refusal this file used to pin, inverted. The campaign view is shown a
    // live fight, and the night ends anyway — with the *same* single PATCH, and
    // in particular with no `POST …/end` of its own: taking the run off the
    // table as `carried` is the server's half of the transaction, and a client
    // that also ended it would be writing `resolved` over the answer.
    alsoAnswerTheCampaignView(false);
    renderCampaign();

    await userEvent.click(await screen.findByRole("button", { name: "Finish the night" }));
    await screen.findByText("Finish session 12?");
    // It says which fight is being carried. Ending the evening over a live
    // fight should never be a surprise, even though it is no longer refused.
    await screen.findByText(/Ambush in the reeds is still on the table/);
    await userEvent.click(screen.getByRole("button", { name: "Finish the night" }));

    await waitFor(() => expect(sessionWrites()).toHaveLength(1));
    expect(sessionWrites()[0]).toEqual({
      method: "PATCH",
      pathname: sessionPath,
      body: { endedAt: "<an instant>" },
    });
    expect(server.calls.filter((call) => call.pathname.endsWith("/end"))).toEqual([]);
  });
});
