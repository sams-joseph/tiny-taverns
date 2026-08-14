import type { Campaign, CampaignId, Creature } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Button,
  Icon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";

/**
 * Using a Library entity in a campaign — **statement 3 of the captain's model**,
 * and the only place in the product where a copy is made.
 *
 * > when you use them in a campaign they are copied in […] the campaign is a
 * > copied state of the entity
 *
 * `POST /campaigns/:c/creatures/:id/derive` is that copy, and its source read
 * (`copyableIntoCampaign`) widened to accept a Library original when the model
 * landed — which is what removed the reason this action was absent from the
 * first draft of the Library screen.
 *
 * ### The campaign is chosen, never inferred
 *
 * The Library names no campaign — that is the whole shape of the read behind it
 * — so a copy has nowhere to land until the DM says where. There is no
 * "current campaign" to fall back on and inventing one would be the worst kind
 * of guess: silently writing a row into a table nobody named. So the control is
 * a select over the tables this account **runs**, filtered in `load.ts` because
 * `derive` writes through `rowWritable` and a table you only play at would be a
 * choice that exists and then errors.
 *
 * ### Two things it says out loud, because both surprise people
 *
 * Both are the captain's decisions of 2026-08-14, and both are rendered rather
 * than hidden — a screen is where a model gets explained once, plainly:
 *
 * - **A copy is a snapshot.** Nothing is ever read through `derived_from`, so
 *   editing the original afterwards does not reach the campaign's row. A DM who
 *   fixed a typo in their Library and expected tonight's fight to change would
 *   otherwise find out at the table.
 * - **Copying again makes a second copy.** `derive` has no uniqueness rule and
 *   nothing refuses it. Saying so is better than a button that looks idempotent
 *   and is not — and it is occasionally what somebody wants, since two of a
 *   monster in one campaign is a legal thing to have.
 */
export function CopyIntoCampaign({
  creature,
  campaigns,
}: {
  readonly creature: Creature;
  /** The tables this account runs. Empty is a real state, and it is answered. */
  readonly campaigns: ReadonlyArray<Campaign>;
}) {
  const [target, setTarget] = useState<CampaignId | undefined>(campaigns[0]?.id);
  const [copiedInto, setCopiedInto] = useState<Campaign>();
  const { busy, failure, submit } = useMutation();

  const copy = async () => {
    const campaign = campaigns.find((entry) => entry.id === target);
    if (campaign === undefined) return;
    const made = await submit((client) =>
      client.creatures.derive({
        params: { campaignId: campaign.id, creatureId: creature.id },
        // Nothing to change on the way in: this is *use it as it is*, and the
        // payload's fields are all optional. Editing a copy afterwards is the
        // campaign's own business, which is what a copied state means.
        payload: {},
      }),
    );
    if (Result.isSuccess(made)) setCopiedInto(campaign);
  };

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-label leading-snug font-semibold text-heading">Use it in a campaign</p>
        {/* The honest empty answer rather than a disabled select over nothing.
            An account can have a Library and no table — authoring is not an act
            inside a campaign, so it cannot require one. */}
        <p className="text-caption leading-body text-muted-foreground">
          You are not running a table yet. Start one and this creature can be copied into it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-label leading-snug font-semibold text-heading">Use it in a campaign</p>

      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          value={target ?? ""}
          onValueChange={(value) => {
            setTarget(value as CampaignId);
            setCopiedInto(undefined);
          }}
        >
          <SelectTrigger aria-label="Copy into" className="h-control-sm min-w-52 flex-1">
            {/* Written out rather than left to Base UI: `Select.Value` with
                neither `items` nor children serialises the *value*, which here
                is a uuid. */}
            <SelectValue>
              {(value) =>
                campaigns.find((campaign) => campaign.id === value)?.name ?? "Choose a table"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.id} value={campaign.id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={busy || target === undefined} onClick={() => void copy()}>
          <Icon name="copy" size={13} />
          {busy ? "Copying…" : "Copy in"}
        </Button>
      </div>

      <p className="text-caption leading-body text-muted-foreground">
        The campaign gets a copy of this creature as it is now. Editing it here afterwards will not
        change that copy.
      </p>

      {failure !== undefined && <SaveFailure failure={failure} />}

      {copiedInto !== undefined && failure === undefined && (
        <p role="status" className="text-caption leading-body text-muted-foreground">
          Copied into {copiedInto.name}.{" "}
          {/* The campaign bestiary is where the copy landed, and it is still a
              route precisely because it answers a question the Library cannot:
              what is in *this* campaign. */}
          <Link
            to="/campaigns/$campaignId/bestiary"
            params={{ campaignId: copiedInto.id }}
            className="text-link hover:text-link-hover"
          >
            Open its bestiary
          </Link>
          . Copying again makes a second copy.
        </p>
      )}
    </div>
  );
}
