import { renderAt } from "../test/renderRoute";
import { HostedSessionContext, type HostedSession } from "../auth/hostedSession";
import { campaignId, goblin, noSession } from "../campaign/campaign.fixtures";

/**
 * The bestiary's test wire.
 *
 * The rows come from `campaign/campaign.fixtures.tsx`, which is where every
 * screen's fixtures live so that a field renamed upstream is one edit rather
 * than one per test file — and, as that file records, they are the JSON the
 * server sends rather than the decoded classes, so a rename fails decoding
 * instead of rendering `undefined`.
 *
 * What is added here is the half the shared fixtures have no reason to hold: a
 * creature the DM *wrote*. `goblin` and `hag` are both `system`, and a bestiary
 * whose fixtures are all one provenance cannot show that the screen tells them
 * apart — which is the thing this screen most has to get right.
 */

export { campaign, campaignId, goblin, hag } from "../campaign/campaign.fixtures";

/**
 * The DM's own: `campaignId` set, `origin: "authored"`, and a reskin trail back
 * to the bundled goblin.
 */
export const bandit = {
  ...goblin,
  id: "2b1f2a1e-0000-4000-8000-000000000a03",
  campaignId,
  derivedFrom: goblin.id,
  origin: "authored",
  name: "Saltmarsh Bandit",
  cr: "1/4",
  crSort: 0.25,
  ac: 13,
  hp: 11,
  environments: ["River"],
  statBlock: { ...goblin.statBlock, meta: "Medium humanoid, chaotic neutral" },
};

export const renderBestiary = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/bestiary`, (screen) => (
    <HostedSessionContext value={hosted}>{screen}</HostedSessionContext>
  ));
};
