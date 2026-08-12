import { Badge, Button, Card, Icon, Input } from "@taverns/ui";
import { useState } from "react";
import { ARTIFACT_KINDS, type HobArtifact } from "./transcript";

/**
 * The core interaction: a generated result, with somewhere for it to go.
 *
 * `ui_kits/dm-screen/ChatParts.jsx`'s `ArtifactCard`, and the three ways to
 * refine it that the kit's README calls deliberate — **keep talking** for a
 * judgement call, **a quick-action chip** for the predictable 80%, and **click
 * the title** when you only want to rename the thing.
 *
 * Every handler is optional, and the card disables what it is not given rather
 * than offering a control that does nothing. That is not defensive typing: with
 * no assistant behind the panel there is no *Try again*, and there is nothing
 * for *Save to session* to write into — see `conversation.ts`.
 */

/**
 * A rules answer has no save action. Straight from the kit's README: *"Rules
 * answers deliberately have no save action — 'Nothing to save, this one's just
 * an answer.'"* The prototype states it in `RulesBody`'s footer and then renders
 * the buttons anyway, which is the one place the specimen and its own
 * documentation disagree; the documentation wins.
 */
const isSaveable = (artifact: HobArtifact) => artifact.kind !== "rules";

function EncounterBody({ artifact }: { readonly artifact: HobArtifact & { kind: "encounter" } }) {
  return (
    <div className="flex flex-col gap-1.5">
      {artifact.roster.map((line) => (
        <div
          key={line.name}
          className="flex items-center gap-2.5 rounded-sm bg-surface-sunken px-2.5 py-1.5"
        >
          <span className="w-4.5 font-mono text-mono leading-snug font-medium text-accent-ink">
            &times;{line.count}
          </span>
          <span className="flex-1 text-body-s leading-snug font-medium text-heading">
            {line.name}
          </span>
          <span className="font-mono text-mono leading-snug font-medium text-muted-foreground">
            {line.cr}
          </span>
          <span className="font-mono text-mono leading-snug font-medium text-muted-foreground">
            {line.hp}
          </span>
        </div>
      ))}
      <div className="flex gap-3.5 pt-1 font-mono text-mono leading-snug font-medium text-muted-foreground">
        <span>{artifact.adjustedXp}</span>
        <span className="text-accent-ink">{artifact.verdict}</span>
      </div>
    </div>
  );
}

function ReadAloudBody({ artifact }: { readonly artifact: HobArtifact & { kind: "readaloud" } }) {
  return (
    <blockquote className="rounded-r-sm border-l-2 border-accent bg-surface-sunken px-3.5 py-2.5">
      <p className="font-serif text-body-s leading-loose italic text-slate-200">{artifact.text}</p>
    </blockquote>
  );
}

/**
 * A note or a beat: prose Hob wrote, in the app's own voice.
 *
 * Not the read-aloud blockquote, and the difference is the point of having two.
 * Read-aloud is serif and italic because it is meant to be *spoken at the
 * table*; a prep note and a beat are the DM's record and are set like every
 * other body of text in the product. The delivery has no body for either — it
 * draws neither kind — so this is the smallest thing that could be right.
 */
function ProseBody({ artifact }: { readonly artifact: HobArtifact & { kind: "note" | "beat" } }) {
  return (
    <p className="text-body-s leading-body whitespace-pre-wrap text-foreground">{artifact.text}</p>
  );
}

function NpcBody({ artifact }: { readonly artifact: HobArtifact & { kind: "npc" } }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3.5 font-mono text-mono leading-snug font-medium text-foreground">
        <span>{artifact.species}</span>
        <span className="text-muted-foreground">{artifact.alignment}</span>
      </div>
      <div className="text-body-s leading-body text-foreground">{artifact.summary}</div>
      <div className="flex items-center gap-2 rounded-sm bg-surface-sunken px-2.5 py-1.5">
        <Icon name="mic" size={13} className="shrink-0 text-magic-ink" />
        <span className="text-caption leading-body text-muted-foreground">{artifact.voice}</span>
      </div>
    </div>
  );
}

function ChecklistBody({ artifact }: { readonly artifact: HobArtifact & { kind: "checklist" } }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {artifact.items.map((item) => (
        <li
          key={item.text}
          className={
            item.done
              ? "flex items-center gap-2.5 text-body-s leading-snug text-faint"
              : "flex items-center gap-2.5 text-body-s leading-snug text-foreground"
          }
        >
          <span
            className={
              item.done
                ? "flex size-4 items-center justify-center rounded-xs border border-accent bg-accent text-on-accent"
                : "flex size-4 items-center justify-center rounded-xs border border-strong"
            }
          >
            {item.done && <Icon name="check" size={11} />}
          </span>
          <span className={item.done ? "line-through" : undefined}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

function RulesBody({ artifact }: { readonly artifact: HobArtifact & { kind: "rules" } }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-body-s leading-body text-foreground">{artifact.answer}</div>
      <div className="flex items-center gap-1.5 text-caption leading-snug text-faint">
        <Icon name="book-open" size={12} />
        Nothing to save &mdash; this one&rsquo;s just an answer.
      </div>
    </div>
  );
}

function ArtifactBody({ artifact }: { readonly artifact: HobArtifact }) {
  switch (artifact.kind) {
    case "encounter":
      return <EncounterBody artifact={artifact} />;
    case "readaloud":
      return <ReadAloudBody artifact={artifact} />;
    case "note":
    case "beat":
      return <ProseBody artifact={artifact} />;
    case "npc":
      return <NpcBody artifact={artifact} />;
    case "checklist":
      return <ChecklistBody artifact={artifact} />;
    default:
      return <RulesBody artifact={artifact} />;
  }
}

export function ArtifactCard({
  artifact,
  saved = false,
  onSave,
  onDiscard,
  onRetry,
  onRename,
  onRefine,
  onOpen,
}: {
  readonly artifact: HobArtifact;
  readonly saved?: boolean;
  readonly onSave?: (artifact: HobArtifact) => void;
  readonly onDiscard?: (artifact: HobArtifact) => void;
  readonly onRetry?: (artifact: HobArtifact) => void;
  readonly onRename?: (artifact: HobArtifact, title: string) => void;
  /** A quick-action chip: the same channel as typing "make it harder", pre-written. */
  readonly onRefine?: (artifact: HobArtifact, chip: string) => void;
  readonly onOpen?: (artifact: HobArtifact) => void;
}) {
  const meta = ARTIFACT_KINDS[artifact.kind];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(artifact.title ?? "");

  const commit = () => {
    setEditing(false);
    const title = draft.trim();
    if (title !== "" && title !== artifact.title) onRename?.(artifact, title);
    else setDraft(artifact.title ?? "");
  };

  return (
    // `shrink-0`: the thread is a flex column that scrolls, and a flex child
    // is allowed to shrink below its content by default — without this the card
    // collapses to a sliver as soon as the thread is taller than the panel.
    <Card tone="raised" className="shrink-0 overflow-hidden">
      <div className="flex items-start gap-2.5 px-card pt-3 pb-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-strong bg-surface-sunken text-accent-ink">
          <Icon name={meta.icon} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* A beat has no title, and the badge alone is the whole header —
                an empty heading would be a field the API does not have. */}
            {artifact.title === undefined ? null : editing ? (
              <Input
                autoFocus
                aria-label="Title"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commit();
                  if (event.key === "Escape") {
                    setDraft(artifact.title ?? "");
                    setEditing(false);
                  }
                }}
                className="h-8 max-w-65"
              />
            ) : (
              <button
                type="button"
                disabled={onRename === undefined}
                onClick={() => setEditing(true)}
                title="Click to edit"
                className="font-display text-title leading-snug font-semibold text-heading not-disabled:cursor-text disabled:cursor-default"
              >
                {artifact.title}
              </button>
            )}
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
          {artifact.meta !== undefined && (
            <div className="mt-0.5 font-mono text-mono leading-snug font-medium text-muted-foreground">
              {artifact.meta}
            </div>
          )}
        </div>
        {saved && <Badge variant="success">Saved</Badge>}
      </div>

      <div className="px-card pb-3">
        <ArtifactBody artifact={artifact} />
      </div>

      {artifact.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-card pb-3">
          {artifact.chips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={onRefine === undefined}
              onClick={() => onRefine?.(artifact, chip)}
              className="inline-flex h-6.5 items-center gap-1.5 rounded-pill border border-dashed border-strong px-2.5 text-caption leading-none text-muted-foreground transition-control not-disabled:cursor-pointer not-disabled:hover:text-heading disabled:cursor-default"
            >
              <Icon name="wand-sparkles" size={11} />
              {chip}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-hairline bg-surface-card px-card py-2.5">
        {saved ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={onOpen === undefined}
              onClick={() => onOpen?.(artifact)}
            >
              Open it
            </Button>
            <span className="ml-auto text-caption leading-none text-faint">
              In tonight&rsquo;s session
            </span>
          </>
        ) : (
          <>
            {isSaveable(artifact) && (
              <Button size="sm" disabled={onSave === undefined} onClick={() => onSave?.(artifact)}>
                Save to session
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={onDiscard === undefined}
              onClick={() => onDiscard?.(artifact)}
            >
              Discard
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={onRetry === undefined}
              onClick={() => onRetry?.(artifact)}
            >
              Try again
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
