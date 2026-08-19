import { HostedSessionScope } from "../auth/AuthProvider";
import { CampaignId } from "@taverns/api";
import { Schema } from "effect";
import { renderAt } from "../test/renderRoute";
import { type HostedSession } from "../auth/hostedSession";
import {
  campaign,
  campaignId,
  dmAccountId,
  goblin,
  noSession,
} from "../campaign/campaign.fixtures";

/**
 * The test wire for both lists over `creature`.
 *
 * The rows come from `campaign/campaign.fixtures.tsx`, which is where every
 * screen's fixtures live so that a field renamed upstream is one edit rather
 * than one per test file — and, as that file records, they are the JSON the
 * server sends rather than the decoded classes, so a rename fails decoding
 * instead of rendering `undefined`.
 *
 * **What is added here is one row per ownership position**, because since
 * `0015_library_creatures.ts` a creature is a campaign's, an account's or
 * nobody's, and the two lists are told apart by exactly that:
 *
 * | fixture               | `campaignId` | `accountId` | appears in            |
 * | --------------------- | ------------ | ----------- | --------------------- |
 * | `goblin`, `hag`       | null         | null        | both — it is the bundle |
 * | `bandit`              | a campaign   | null        | the campaign bestiary |
 * | `owlbear`, `sexton`   | null         | the account | the Library           |
 *
 * A list whose fixtures were all one position could not show that either screen
 * tells them apart, which is the thing both most have to get right.
 */

export { campaign, campaignId, goblin, hag } from "../campaign/campaign.fixtures";

/**
 * A **campaign's own** creature: `campaignId` set, `origin: "authored"`, and a
 * reskin trail back to the bundled goblin.
 *
 * Under the captain's model this is a *copy* — what a campaign holds — so it is
 * in the campaign bestiary and must never appear in the Library.
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

/**
 * A **Library original**: in no campaign, owned by this account, written by
 * them. The row the Library exists for, and the only kind that carries an
 * *Edit*.
 */
export const owlbear = {
  ...goblin,
  id: "2b1f2a1e-0000-4000-8000-000000000a05",
  campaignId: null,
  accountId: dmAccountId,
  derivedFrom: null,
  origin: "authored",
  name: "Bog Owlbear",
  size: "Large",
  type: "Monstrosity",
  cr: "3",
  crSort: 3,
  ac: 14,
  hp: 59,
  environments: ["Marsh", "Barrow"],
  statBlock: { ...goblin.statBlock, meta: "Large monstrosity, unaligned" },
};

/**
 * A second Library original, `imported` — which is the case that proves the
 * badge is read off `origin` while *may I edit this* is read off `accountId`.
 * Imported and yours are not in tension.
 */
export const sexton = {
  ...owlbear,
  id: "2b1f2a1e-0000-4000-8000-000000000a06",
  origin: "imported",
  name: "Barrow Sexton",
  size: "Medium",
  type: "Undead",
  cr: "2",
  crSort: 2,
  ac: 12,
  hp: 26,
  environments: ["Barrow"],
};

/** A second table this account runs — the copy control needs somewhere to choose between. */
export const otherCampaignId = Schema.decodeSync(CampaignId)(
  "2b1f2a1e-0000-4000-8000-00000000beef",
);

export const otherCampaign = {
  ...campaign,
  id: otherCampaignId,
  name: "The Hag's Bargain",
  partyName: null,
  currentSessionId: null,
};

/**
 * `GET /me/campaigns` as the Library reads it: two tables this account **runs**,
 * which is what the copy-into-a-campaign select offers. A table it only plays at
 * is filtered out in `load.ts`, because `derive` writes through `rowWritable`.
 */
export const bothMemberships = [
  { campaign, role: "dm", joinedAt: "2026-06-01T10:00:00.000Z" },
  { campaign: otherCampaign, role: "dm", joinedAt: "2026-06-02T10:00:00.000Z" },
];

export const renderBestiary = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt(`/campaigns/${campaignId}/bestiary`, (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};

/** The Library names no campaign — that is the whole shape of the read behind it. */
export const renderLibrary = async (hosted: HostedSession = noSession): Promise<void> => {
  await renderAt("/library", (screen) => (
    <HostedSessionScope session={hosted}>{screen}</HostedSessionScope>
  ));
};
