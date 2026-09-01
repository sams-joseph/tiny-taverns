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
 * *New character*, from the roster — **the picker, which is step one of the
 * flow rather than a control on the form.**
 *
 * The captain reordered the drawn wizard so that finding a table comes first
 * (`CharacterCreateScreen` says why at length), and this is the whole of that
 * step. It is here rather than on the create screen because the campaign is in
 * that screen's URL: choosing has to happen before the route exists, and a
 * second picker on the far side would let a reader change the answer without
 * the URL saying so.
 *
 * **It costs no read.** `GET /me/campaigns` is already in `MyCharactersView` —
 * the roster needs it to name each character's table and to tell its two
 * silences apart — so the tables this offers are a fold of an answer the screen
 * has, not a request of its own.
 *
 * Three shapes, and the first two are the ones that matter at a real table:
 *
 * - **No table** — nothing at all. A character has to go somewhere, and the
 *   roster's empty state already says how to get somewhere: follow the link your
 *   DM sends. A button that opened a picker with nothing in it would be the
 *   control-that-goes-nowhere this product refuses everywhere else.
 * - **One table** — a link straight to it. Almost everybody, and asking them to
 *   confirm a choice with one option is a press that answers nothing.
 * - **Several** — a dialog. The choice is which table, and a dialog is what this
 *   product uses to ask one thing; a `Select` in a top bar would put the
 *   question and the answer in different places, and Base UI's is the one
 *   control that is genuinely awkward to drive.
 *
 * **Player tables only.** `ensureCampaignReadable` would let a DM through at
 * their own table and the server documents that as harmless, but the pill is a
 * *mode*: a table you run has no player screen to be on, and the way to write a
 * character there is `campaign/CharacterDialog.tsx`. `tablesForNewCharacter` is
 * where that is decided, once.
 */
export function NewCharacterAction({
  memberships,
}: {
  readonly memberships: ReadonlyArray<CampaignMembership>;
}) {
  const [picking, setPicking] = useState(false);
  const tables = tablesForNewCharacter(memberships);

  if (tables.length === 0) return null;

  if (tables.length === 1) {
    return (
      <Button
        size="sm"
        nativeButton={false}
        render={
          <Link
            to="/campaigns/$campaignId/characters/new"
            params={{ campaignId: tables[0]!.campaign.id }}
          />
        }
      >
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
          <DialogContent aria-label="Which table?">
            <DialogHeader>
              <DialogTitle>Which table?</DialogTitle>
              <DialogDescription>
                A character belongs to one game. Pick the one they are playing in — bringing them to
                a second table is not something this can do yet.
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
