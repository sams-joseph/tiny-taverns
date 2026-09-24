import type { CampaignMembership } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from "@taverns/ui";
import { useState } from "react";
import { tablesForNewCharacter } from "./create";

/**
 * *New character*, from the roster — **the context picker, which is step one
 * of the flow rather than a control on the form.**
 *
 * The captain reordered the drawn wizard so that choosing the context comes
 * first (`CharacterCreateScreen` says why at length), and this is the whole of
 * that step. It is here rather than on the create screen because the context
 * is in that screen's URL: choosing has to happen before the route exists, and
 * a second picker on the far side would let a reader change the vocabulary/Hob
 * context without the URL saying so.
 *
 * **It costs no read.** `GET /me/campaigns` is already in `MyCharactersView` —
 * the roster needs it to name each character's table and to tell its two
 * silences apart — so the tables this offers are a fold of an answer the screen
 * has, not a request of its own.
 *
 * **It is always offered.** By the captain's decision of 2026-09-23 a character
 * needs no campaign: *No campaign* is a context too, the core rules with no
 * table's homebrew (`/characters/new`, `POST /me/characters`, and Hob through
 * `/me/hob`). It
 * used to draw nothing for an account at no table, which left somebody who had
 * just signed up with no way to make anything. Two shapes:
 *
 * - **No table** — a link straight to the core-rules form. *No campaign* is the
 *   only answer, and asking somebody to confirm a choice with one option is a
 *   press that answers nothing.
 * - **Any table** — a dialog listing each table and *No campaign*. The choice
 *   is which rules, and a dialog is what this product uses to ask one thing; a
 *   `Select` in a top bar would put the question and the answer in different
 *   places, and Base UI's is the one control that is genuinely awkward to drive.
 *
 * **Every table, the ones you run included.** The continuity decision of
 * 2026-09-01 made a character account-owned and its creator a player too, so
 * the old *player tables only* narrowing went with the DM-typed character
 * dialog it existed to point at. `tablesForNewCharacter` is where that is
 * decided, once.
 */
export function NewCharacterAction({
  memberships,
}: {
  readonly memberships: ReadonlyArray<CampaignMembership>;
}) {
  const [picking, setPicking] = useState(false);
  const tables = tablesForNewCharacter(memberships);

  if (tables.length === 0) {
    return (
      <Button size="sm" nativeButton={false} render={<Link to="/characters/new" />}>
        <Icon name="user-plus" size={14} />
        New character
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setPicking(true)}>
        <Icon name="user-plus" size={14} />
        New character
      </Button>

      {picking && (
        <Dialog open onOpenChange={(open) => !open && setPicking(false)}>
          <DialogContent aria-label="Which rules?">
            <DialogHeader>
              <DialogTitle>Which rules?</DialogTitle>
              <DialogDescription>
                Pick the campaign whose rules and Hob context this character starts from, or no
                campaign for the core rules alone. Either way they are yours and unseated until you
                add them to a campaign.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 px-gutter py-3">
              {tables.map((membership) => (
                <Button
                  key={membership.campaign.id}
                  variant="secondary"
                  className="justify-start"
                  nativeButton={false}
                  render={
                    <Link
                      to="/campaigns/$campaignId/characters/new"
                      params={{ campaignId: membership.campaign.id }}
                    />
                  }
                >
                  <Icon name="book-open" size={14} className="shrink-0 text-accent-ink" />
                  <span className="min-w-0 truncate">{membership.campaign.name}</span>
                </Button>
              ))}
              <Button
                variant="secondary"
                className="justify-start"
                nativeButton={false}
                render={<Link to="/characters/new" />}
              >
                <Icon name="scroll-text" size={14} className="shrink-0 text-accent-ink" />
                <span className="min-w-0 truncate">No campaign</span>
                <span className="ml-auto shrink-0 text-caption text-muted-foreground">
                  Core rules only
                </span>
              </Button>
            </div>

            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={() => setPicking(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
