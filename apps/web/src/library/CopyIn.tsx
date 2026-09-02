import type { Campaign, CampaignId } from "@taverns/api";
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
import { useState, type ReactNode } from "react";
import type { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import type { TavernsClient } from "../api/client";
import type { ReadKey } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";

/**
 * Using a Library entity in a campaign — statement 3 of the captain's model,
 * generalised from the creature dialog's control so every reader says it the
 * same way.
 *
 * The campaign is chosen, never inferred: the Library names no campaign, so a
 * copy has nowhere to land until the DM says where. The two sentences under the
 * control are the captain's decisions of 2026-08-14, rendered rather than
 * hidden: **a copy is a snapshot** (editing the original afterwards does not
 * reach it), and **copying again makes a second copy** (`derive` has no
 * uniqueness rule).
 *
 * It sits in a `DetailSection` at the end of the reader's body — beside the row
 * it acts on, with the footer staying *Close* — the placement `CreatureDialog`
 * records the reasoning for.
 */
export function CopyIntoCampaignSection({
  noun,
  campaigns,
  derive,
  readsChanged,
  copiedLink,
}: {
  /** What is being copied — "creature", "spell" — for the sentences. */
  readonly noun: string;
  /** The tables this account runs. Empty is a real state, and it is answered. */
  readonly campaigns: ReadonlyArray<Campaign>;
  /** The one write: the derive call for this corpus, at the chosen table. */
  readonly derive: (
    campaignId: CampaignId,
  ) => (client: TavernsClient) => Effect.Effect<unknown, unknown, HttpClient.HttpClient>;
  /** Which reads the copy changed — that campaign's own list. */
  readonly readsChanged: (campaignId: CampaignId) => ReadonlyArray<ReadKey>;
  /** A link to where the copy landed, when the campaign screen exists. */
  readonly copiedLink?: (campaign: Campaign) => ReactNode;
}) {
  const [target, setTarget] = useState<CampaignId | undefined>(campaigns[0]?.id);
  const [copiedInto, setCopiedInto] = useState<Campaign>();
  const { busy, failure, submit } = useMutation();

  const copy = async () => {
    const campaign = campaigns.find((entry) => entry.id === target);
    if (campaign === undefined) return;
    const made = await submit(derive(campaign.id), [...readsChanged(campaign.id)]);
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
          You are not running a table yet. Start one and this {noun} can be copied into it.
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
        The campaign gets a copy of this {noun} as it is now. Editing it here afterwards will not
        change that copy.
      </p>

      {failure !== undefined && <SaveFailure failure={failure} />}

      {copiedInto !== undefined && failure === undefined && (
        <p role="status" className="text-caption leading-body text-muted-foreground">
          Copied into {copiedInto.name}.
          {copiedLink !== undefined && <> {copiedLink(copiedInto)}.</>} Copying again makes a second
          copy.
        </p>
      )}
    </div>
  );
}
