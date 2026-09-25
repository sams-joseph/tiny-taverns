import type { Character, PartySeat } from "@taverns/api";
import { Icon, Toggle } from "@taverns/ui";
import { DateTime, Result } from "effect";
import { useEffect, useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";

/**
 * The DM's award of inspiration, on the card and on the seat's page: one
 * `Toggle`, pressed while the character holds it, sending `{ inspiration }`
 * through the seat (`PartySeatUpdate`). The owner reads it on their own sheet
 * and cannot set it; it is the table's award, like the rest of the live state.
 *
 * The press shows at once: what was asked stands until the frame's re-read
 * answers, so the toggle never flicks back between the write and the read. A refused write drops it and says why, and the toggle returns to what
 * the server holds.
 *
 * `labelled` draws the word beside the icon, where there is room for it; on the
 * card it is the icon alone, and the accessible name says whose it is either
 * way. A failure takes a whole line of its own, so the parent is a wrapping
 * row.
 */
export function InspirationToggle({
  row,
  character,
  name,
  labelled = false,
}: {
  readonly row: PartySeat;
  readonly character: Character;
  readonly name: string;
  readonly labelled?: boolean;
}) {
  const { busy, failure, submit } = useMutation();
  /** What was pressed, and the character's clock when it was. */
  const [asked, setAsked] = useState<{ readonly value: boolean; readonly at: number }>();
  const held = character.inspiration;
  const at = DateTime.toEpochMillis(character.updatedAt);
  // The press stands until the server has said something newer — normally the
  // same thing, but a re-read that disagrees is the truth, not the press.
  useEffect(() => {
    if (asked !== undefined && !busy && (asked.value === held || asked.at !== at)) {
      setAsked(undefined);
    }
  }, [asked, busy, held, at]);
  const pressed = asked?.value ?? held;
  const campaignId = row.seat.campaignId;

  const award = async (inspiration: boolean) => {
    setAsked({ value: inspiration, at });
    const done = await submit(
      (client) =>
        client.party.update({
          params: { campaignId, campaignCharacterId: row.seat.id },
          payload: { inspiration },
        }),
      // The creator's own seated character is on their *My characters* too.
      [reads.party(campaignId), reads.myCharacters],
    );
    if (Result.isFailure(done)) setAsked(undefined);
  };

  return (
    <>
      <Toggle
        size={labelled ? "sm" : "default"}
        aria-label={`Inspiration for ${name}`}
        title={pressed ? "Inspired" : "Award inspiration"}
        pressed={pressed}
        onPressedChange={(next) => void award(next)}
        className={labelled ? undefined : "size-9 px-0"}
      >
        <Icon name="sparkles" size={14} />
        {labelled && "Inspiration"}
      </Toggle>
      {failure !== undefined && (
        <div className="basis-full">
          <SaveFailure failure={failure} />
        </div>
      )}
    </>
  );
}
