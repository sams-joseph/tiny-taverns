import type { Campaign, Visibility } from "@taverns/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { Field, SaveFailure, VisibilityField } from "../ui/form";

/**
 * The campaign's own settings — and the one control the whole player half of
 * the product is waiting on.
 *
 * ### Why this dialog exists at all
 *
 * `campaign.visibility` is the **master toggle**: `repo/visibility.ts` embeds
 * `campaignReadable` in every row predicate in the product, so a `shared` note
 * inside a `dm` campaign is still invisible. Every per-row *Players can see
 * this* switch already shipped — on encounters, notes, runs, combatants — was
 * therefore inert, because nothing anywhere could set the column they all
 * narrow within. This is that field. Without it the first player to follow an
 * invite gets a blank page, and no amount of per-row sharing changes it.
 *
 * ### Fail-closed, said out loud rather than implied
 *
 * A campaign starts `dm` — the column default, which `CampaignCreate` is
 * careful not to restate — and every other visibility control in this app opens
 * off for the same reason. What is different here is that this one governs the
 * others, so it is not enough for the switch to be off: the DM has to be able
 * to read the current answer *without* opening anything. Hence the top bar's
 * button says **Private** or **Shared** in words rather than being a gear, and
 * the sentence under the switch names the consequence in both directions.
 *
 * ### What else is in it, and why so little
 *
 * `partyName` and `playerCount` are the two fields the campaign screen already
 * renders in its subtitle and the campaign list renders on its card, and until
 * now neither was reachable after `NewCampaign` typed a name. `name` is here
 * for the same reason. `currentSessionId` is deliberately absent — which night
 * is current is a transition, owned by `StartRunDialog` and
 * `session/finish.ts`, and a text field pointing at a session is a second
 * answer to a question the server settles with a constraint.
 *
 * Archiving is absent too: a campaign is someone's two years of Thursday
 * nights, `campaigns.archive` is the soft delete for it, and putting that
 * behind the same button as "rename it" is how it gets pressed by accident.
 */

/** Matches `CampaignUpdate.playerCount`, so the sentence beats the schema to it. */
const MAX_PLAYERS = 64;

export function CampaignDialog({
  campaign,
  onClose,
  onSaved,
}: {
  readonly campaign: Campaign;
  readonly onClose: () => void;
  /** Re-reads the view: the name, the subtitle and the badge all move. */
  readonly onSaved: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [partyName, setPartyName] = useState(campaign.partyName ?? "");
  const [playerText, setPlayerText] = useState(String(campaign.playerCount));
  // Opens on what is already stored — this is an edit, and the campaign has an
  // answer. `dm` is where a campaign *starts*; `CampaignCreate` is the place
  // that leaves the default alone.
  const [visibility, setVisibility] = useState<Visibility>(campaign.visibility);
  const [showProblems, setShowProblems] = useState(false);

  const { busy, failure, submit } = useMutation();

  const playerCount = Number(playerText);
  const problems: { name?: string; playerCount?: string } = {};
  if (name.trim() === "") problems.name = "Give it a name.";
  if (playerText.trim() === "" || !Number.isInteger(playerCount)) {
    problems.playerCount = "A whole number of people at the table.";
  } else if (playerCount < 0 || playerCount > MAX_PLAYERS) {
    problems.playerCount = `Somewhere between none and ${MAX_PLAYERS}.`;
  }
  const refused = Object.keys(problems).length > 0;

  const save = async () => {
    setShowProblems(true);
    if (refused) return;

    const saved = await submit(
      (client) =>
        client.campaigns.update({
          params: { campaignId: campaign.id },
          payload: {
            name: name.trim(),
            // `partyName` is `optional(NullOr(String))` on update: a party that
            // has no name is a null, which is what clearing the field means.
            partyName: partyName.trim() === "" ? null : partyName.trim(),
            playerCount,
            visibility,
          },
        }),
      // The row itself, and the two lists that draw its name — `GET /me/campaigns`
      // renders the campaign, not just the membership, so a rename here is a
      // rename on the campaign list behind this dialog.
      [reads.campaign(campaign.id), reads.myCampaigns],
    );

    if (Result.isSuccess(saved)) onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Campaign settings">
        <DialogHeader>
          <DialogTitle>Campaign settings</DialogTitle>
          <DialogDescription>
            What this table is called, who is at it, and whether any of it reaches them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-gutter py-3">
          <Field
            label="Name"
            htmlFor="campaign-name"
            error={showProblems ? problems.name : undefined}
          >
            <Input
              id="campaign-name"
              placeholder="The Salt Road"
              value={name}
              aria-invalid={showProblems && problems.name !== undefined}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field
            label="Party"
            htmlFor="campaign-party"
            hint="What the party calls itself, if it calls itself anything."
          >
            <Input
              id="campaign-party"
              placeholder="The Gilded Spoon"
              value={partyName}
              onChange={(event) => setPartyName(event.target.value)}
            />
          </Field>

          <Field
            label="Players"
            htmlFor="campaign-players"
            hint="How many people sit down. It is the line under the campaign's name."
            error={showProblems ? problems.playerCount : undefined}
          >
            <Input
              id="campaign-players"
              mono
              type="number"
              min={0}
              max={MAX_PLAYERS}
              value={playerText}
              aria-invalid={showProblems && problems.playerCount !== undefined}
              onChange={(event) => setPlayerText(event.target.value)}
              className="w-24"
            />
          </Field>

          {/* The same control every row-level share uses, so the vocabulary at
              the table is one vocabulary. What is different is the reach: this
              one is the gate the others narrow within, which is what the two
              sentences say. */}
          <VisibilityField
            id="campaign-visibility"
            value={visibility}
            onChange={setVisibility}
            shared="Your players can reach this campaign — and then see whatever inside it you have shared, and nothing else."
            hidden="This campaign is yours alone. Nothing in it reaches a player, however you have set a single note or encounter."
          />
        </div>

        {/* In the footer, beside the button that failed — see `EncounterDialog`. */}
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
