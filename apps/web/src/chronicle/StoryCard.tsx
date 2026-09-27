import {
  CAMPAIGN_PREVIOUSLY_MAX,
  CAMPAIGN_STORY_MAX,
  type CampaignId,
  type CampaignStory,
  type PlayerCampaignStory,
  type Session,
  type Visibility,
} from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  SectionHeading,
} from "@taverns/ui";
import { Result } from "effect";
import { useId, useState, type ReactNode } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { useAskHob } from "../shell/slots";
import { Field, SaveFailure, Textarea, VisibilityField } from "../ui/form";
import { storyIsStale } from "./story";

/**
 * *The story so far*, at the head of the Chronicle's nights, with the
 * *Previously* the DM reads to open the next night inside it.
 *
 * **Hob drafts it and the DM keeps it**, the Shared World's Story So Far
 * pattern: *Ask Hob to draft* opens the panel with the question already asked
 * (`useAskHob`), Hob offers `proposeCampaignStory` there, and only the DM's
 * *Keep* writes it. Once kept it is the DM's to edit, share and clear here.
 *
 * **Previously opens one night.** It was written after a numbered night, so it
 * is drawn only until a newer one has ended; after that it would be telling the
 * table about the night before last, and the card says *Update needed* instead.
 *
 * Both copies are read with the nights rather than after them (`load.ts`).
 * The player's (`PlayerStoryCard`) is a distinct narrow type on a distinct
 * path, answered only once the DM shared it, and carries none of the DM's
 * controls.
 */

/** What *Ask Hob to draft* asks, before a story is kept and once it is behind. */
const DRAFT_ASK =
  "Draft the story so far from the sessions we've played, with a Previously to open the next one.";
const UPDATE_ASK =
  "Update the story so far and its Previously with the sessions played since it was written.";

export function StoryCard({
  campaignId,
  story,
  sessions,
  hobAvailable,
}: {
  readonly campaignId: CampaignId;
  /** Read with the nights (`loadChronicleSpine`); `null` before one is kept. */
  readonly story: CampaignStory | null;
  /** The DM's nights, which say whether a newer one has ended. */
  readonly sessions: ReadonlyArray<Session>;
  /** A model answers behind Hob (`loadChronicleSpine`); without one, no ask. */
  readonly hobAvailable: boolean;
}) {
  const panel = useAskHob();
  const askHob = hobAvailable ? panel : undefined;

  if (story === null) {
    return (
      <StoryFrame>
        <p className="m-0 max-w-measure text-body-s leading-body text-muted-foreground">
          {askHob === undefined
            ? "No story kept yet. Hob drafts one from the sessions you’ve played once a model answers behind it; you keep it, edit it, and share it with the table."
            : "No story kept yet. Hob can draft one from the sessions you’ve played, with a Previously to read when the next one opens. Nothing is kept until you keep it, and the table sees it only once you share it."}
        </p>
        {askHob !== undefined && (
          <div>
            <Button size="sm" variant="outline" onClick={() => askHob(DRAFT_ASK)}>
              <Icon name="sparkles" size={13} />
              Ask Hob to draft
            </Button>
          </div>
        )}
      </StoryFrame>
    );
  }

  return (
    <KeptStory
      campaignId={campaignId}
      story={story}
      stale={storyIsStale(story.afterSessionNumber, sessions)}
      askHob={askHob}
    />
  );
}

function KeptStory({
  campaignId,
  story,
  stale,
  askHob,
}: {
  readonly campaignId: CampaignId;
  readonly story: CampaignStory;
  readonly stale: boolean;
  readonly askHob: ((text: string) => void) | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const share = useMutation();
  const shareId = useId();

  const setVisibility = (visibility: Visibility) =>
    void share.submit(
      // The same words with a visibility is the share switch: the server
      // leaves the text, its origin and its night as they were.
      (client) =>
        client.story.put({
          params: { campaignId },
          payload: { text: story.text, previously: story.previously, visibility },
        }),
      [reads.story(campaignId)],
    );

  return (
    <StoryFrame
      meta={
        <>
          <UpdatedAfter after={story.afterSessionNumber} />
          {stale && <Badge variant="outline">Update needed</Badge>}
        </>
      }
    >
      {editing ? (
        <StoryForm campaignId={campaignId} story={story} onDone={() => setEditing(false)} />
      ) : (
        <>
          <StoryProse
            text={story.text}
            previously={stale ? null : story.previously}
            after={story.afterSessionNumber}
          />
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-hairline pt-4">
            <div className="flex flex-wrap gap-2">
              {askHob !== undefined && stale && (
                <Button size="sm" variant="outline" onClick={() => askHob(UPDATE_ASK)}>
                  <Icon name="sparkles" size={13} />
                  Ask Hob to update
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Icon name="pencil" size={13} />
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setClearing(true)}>
                <Icon name="trash-2" size={13} />
                Clear
              </Button>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <VisibilityField
                id={shareId}
                label="Share with the table"
                value={story.visibility}
                onChange={setVisibility}
                disabled={share.busy}
                shared="The table reads it at the top of their Chronicle."
                hidden="Only you can read it until you share it."
              />
              {share.failure !== undefined && <SaveFailure failure={share.failure} />}
            </div>
          </div>
        </>
      )}
      {clearing && <ClearStoryDialog campaignId={campaignId} onClose={() => setClearing(false)} />}
    </StoryFrame>
  );
}

/** The DM's own words over the kept story, or over Hob's once kept. */
function StoryForm({
  campaignId,
  story,
  onDone,
}: {
  readonly campaignId: CampaignId;
  readonly story: CampaignStory;
  readonly onDone: () => void;
}) {
  const [text, setText] = useState(story.text);
  const [previously, setPreviously] = useState(story.previously ?? "");
  const { busy, failure, submit } = useMutation();
  const textId = useId();
  const previouslyId = useId();

  const save = async () => {
    const done = await submit(
      (client) =>
        client.story.put({
          params: { campaignId },
          payload: {
            text: text.trim(),
            previously: previously.trim() === "" ? null : previously.trim(),
            visibility: story.visibility,
          },
        }),
      [reads.story(campaignId)],
    );
    if (Result.isSuccess(done)) onDone();
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field label="The story so far" htmlFor={textId}>
        <Textarea
          id={textId}
          value={text}
          maxLength={CAMPAIGN_STORY_MAX}
          rows={6}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <Field
        label="Previously"
        htmlFor={previouslyId}
        hint="Read to the table to open the next session. Leave it empty for none."
      >
        <Textarea
          id={previouslyId}
          value={previously}
          maxLength={CAMPAIGN_PREVIOUSLY_MAX}
          rows={3}
          onChange={(event) => setPreviously(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        {failure !== undefined && (
          <div className="min-w-0 basis-full">
            <SaveFailure failure={failure} />
          </div>
        )}
        {/* Outline, not the peach primary: the campaign's press is this
            screen's one. */}
        <Button type="submit" size="sm" variant="outline" disabled={busy || text.trim() === ""}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ClearStoryDialog({
  campaignId,
  onClose,
}: {
  readonly campaignId: CampaignId;
  readonly onClose: () => void;
}) {
  const { busy, failure, submit } = useMutation();

  const clear = async () => {
    const done = await submit(
      (client) => client.story.remove({ params: { campaignId } }),
      [reads.story(campaignId)],
    );
    if (Result.isSuccess(done)) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label="Clear the story so far">
        <DialogHeader>
          <DialogTitle>Clear the story so far?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="px-gutter py-3">
          <p className="text-body-s leading-body text-muted-foreground">
            The story and its Previously are deleted, and the table no longer reads them. The
            sessions themselves are not touched, and Hob can draft a new story from them.
          </p>
        </div>
        <DialogFooter>
          {failure !== undefined && (
            <div className="mr-auto min-w-0 flex-1 text-left">
              <SaveFailure failure={failure} />
            </div>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => void clear()}>
            {busy ? "Clearing…" : "Clear story"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The story as the table reads it, once the DM has shared it; nothing at all
 * before then, because to a player an unshared story and no story are the same
 * answer.
 */
export function PlayerStoryCard({
  story,
  sessions,
}: {
  /** Read with the nights (`loadPlayerChronicle`), and only once shared. */
  readonly story: PlayerCampaignStory | null;
  /** The nights shared with this player. */
  readonly sessions: ReadonlyArray<Session>;
}) {
  if (story === null) return null;
  const stale = storyIsStale(story.afterSessionNumber, sessions);
  return (
    <StoryFrame meta={<UpdatedAfter after={story.afterSessionNumber} />}>
      <StoryProse
        text={story.text}
        previously={stale ? null : story.previously}
        after={story.afterSessionNumber}
      />
    </StoryFrame>
  );
}

/** The drawing's card: the Overview's accent rule over the head of the page. */
function StoryFrame({
  meta,
  children,
}: {
  readonly meta?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label="The story so far" className="mb-3">
      <Card className="gap-4 border-t-3 border-t-accent px-card py-5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
          <SectionHeading size="display">The story so far</SectionHeading>
          {meta}
        </div>
        {children}
      </Card>
    </section>
  );
}

function UpdatedAfter({ after }: { readonly after: number }) {
  return (
    <span className="text-label leading-none text-muted-foreground">
      {after === 0 ? "Written before any session ended" : `Updated after session ${String(after)}`}
    </span>
  );
}

/** The story, and the read-aloud that opens the next night while it still does. */
function StoryProse({
  text,
  previously,
  after,
}: {
  readonly text: string;
  readonly previously: string | null;
  readonly after: number;
}) {
  return (
    <>
      <p className="m-0 max-w-measure text-body leading-body text-pretty whitespace-pre-line text-foreground">
        {text}
      </p>
      {previously !== null && (
        <div className="rounded-md border border-hairline bg-surface-sunken px-4 py-4">
          <div className="flex items-center gap-1.5 text-label-s leading-none font-medium text-muted-foreground">
            <Icon name="scroll-text" size={13} />
            Previously, to open session {after + 1}
          </div>
          <p className="mt-2.5 mb-0 max-w-measure font-serif text-body-l leading-loose text-pretty whitespace-pre-line text-foreground italic">
            {previously}
          </p>
        </div>
      )}
    </>
  );
}
