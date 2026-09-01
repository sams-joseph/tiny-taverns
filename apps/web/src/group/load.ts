import type { Group, GroupCampaignCard, GroupId, GroupMember } from "@taverns/api";
import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom } from "../api/atoms";
import { reads } from "../api/keys";

/**
 * The group reads, cut the way the screens want them.
 *
 * `groupsAtom` is the home list — every group this account is a live member
 * of, with `isOwner` on each row. `groupViewAtom` is one group's whole screen:
 * the row, the campaign directory and the roster, one value with three states,
 * because every write on the group screen changes at least two of the three
 * (founding a campaign moves the directory and — for the founder — the
 * relation on its card; removing a member moves the roster and may retire
 * seats).
 */

export const groupsAtom = apiAtom((client) => client.groups.list(), [reads.myGroups]);

export interface GroupView {
  readonly group: Group;
  readonly campaigns: ReadonlyArray<GroupCampaignCard>;
  readonly members: ReadonlyArray<GroupMember>;
  /** Whether the reader owns the group — what the owner-only chrome keys on. */
  readonly isOwner: boolean;
}

export const groupViewAtom = Atom.family((groupId: GroupId) =>
  apiAtom(
    (client) =>
      Effect.map(
        Effect.all(
          {
            group: client.groups.findById({ params: { groupId } }),
            campaigns: client.groups.campaigns({ params: { groupId } }),
            members: client.groupMembers.list({ params: { groupId } }),
            identity: client.me.identity(),
          },
          { concurrency: "unbounded" },
        ),
        ({ group, campaigns, members, identity }): GroupView => ({
          group,
          campaigns,
          members,
          isOwner: group.ownerAccountId === identity.id,
        }),
      ),
    [reads.group(groupId), reads.myGroups],
  ),
);
