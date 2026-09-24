import { CAMPAIGN_DESCRIPTION_MAX, SHARED_WORLD_DESCRIPTION_MAX } from "@taverns/api";
import { cn } from "@taverns/ui";
import { Textarea } from "./form";

/**
 * A campaign's or a Shared World's description: the pitch its readers read,
 * and what its one cover is drawn from (`CampaignImage.ts`,
 * `SharedWorldImage.ts`).
 *
 * The display and the create forms' box are each spelled once here, so the
 * creator's Overview, the player's page and the world's screen draw the same
 * paragraph, and the two places a campaign is started (the campaign list and a
 * Shared World's screen) ask for it the same way; `campaignCreateFrom` (a
 * campaign's, shared with Hob's accept) and `describedBy` (a Shared World's) are
 * how their payloads carry it. The settings dialogs use a labelled `Field` instead, like
 * every other box in them.
 */

/**
 * The paragraph under the cover. Nothing when none was written. `className`
 * is for the one page that sets it apart, the Overview's hero, which gives it
 * a line of its own measure.
 */
export function Description({
  text,
  className,
}: {
  readonly text: string | null;
  readonly className?: string;
}) {
  if (text === null || text.trim() === "") return null;
  return (
    <p
      className={cn(
        "max-w-measure text-body leading-body whitespace-pre-wrap text-foreground",
        className,
      )}
    >
      {text}
    </p>
  );
}

interface DescriptionInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
}

/** The optional box beside a new campaign's name, read by the one cover draw. */
export function NewCampaignDescription({ value, onChange, disabled }: DescriptionInputProps) {
  return (
    <Textarea
      aria-label="New campaign description"
      className="min-h-16"
      maxLength={CAMPAIGN_DESCRIPTION_MAX}
      placeholder="Optional: the pitch, as your players will read it. The cover is drawn from it."
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** The optional box beside a new Shared World's name, read by the one cover draw. */
export function NewSharedWorldDescription({ value, onChange, disabled }: DescriptionInputProps) {
  return (
    <Textarea
      aria-label="Shared World description"
      className="min-h-16"
      maxLength={SHARED_WORLD_DESCRIPTION_MAX}
      placeholder="Optional: the land, as every member will read it. The cover is drawn from it."
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
