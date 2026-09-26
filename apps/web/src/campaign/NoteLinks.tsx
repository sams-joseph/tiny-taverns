import type {
  CampaignId,
  Encounter,
  Note,
  NoteAttachment,
  NoteLink,
  PartySeat,
} from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Icon,
  type IconName,
} from "@taverns/ui";
import type { ReactNode } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";

/**
 * The pane's *Linked* footer, as the drawing draws it: a chip for each thing
 * the note is about, and each chip opens it — an encounter selected on the
 * Encounters tab, a seat on its own page.
 *
 * **The attachment is the first chip.** It is the read-aloud's one encounter
 * (`attachedTo`), not a link: it is chosen and cleared under *Attached to*, so
 * its chip opens the encounter and has no remove ×. Every other chip is a
 * `note_link`, removed by its own × (`notes.removeLink`) and added from the
 * *Link…* menu (`notes.addLink`), which offers the campaign's encounters and
 * seats the note is not already on. Neither write is an edit of the note: they
 * go at once, not through the pane's autosave, and name `reads.notes`, the only
 * read that carries links.
 *
 * **A chip is drawn only while its target is in what the frame read.** A
 * deleted encounter's link is gone with it (the key cascades), but a retired
 * seat's link stays in the record, and its page would answer *not found*.
 */
export function NoteLinks({
  campaignId,
  note,
  attachedTo,
  encounters,
  party,
}: {
  readonly campaignId: CampaignId;
  /** The note as the server last answered it: its links. */
  readonly note: Note;
  /** The draft's attachment, so the chip follows *Attached to* at once. */
  readonly attachedTo: NoteAttachment | null;
  readonly encounters: ReadonlyArray<Encounter>;
  readonly party: ReadonlyArray<PartySeat>;
}) {
  const { busy, failure, submit } = useMutation();
  const encounterOf = (id: string) => encounters.find((encounter) => encounter.id === id);
  const seatOf = (id: string) => party.find((row) => row.seat.id === id)?.seat;

  const attached = attachedTo === null ? undefined : encounterOf(attachedTo.id);
  const linked = note.links.flatMap((link) => {
    const label =
      link.kind === "encounter" ? encounterOf(link.id)?.name : seatOf(link.id)?.displayName;
    return label === undefined ? [] : [{ link, label }];
  });

  const has = (kind: NoteLink["kind"], id: string) =>
    note.links.some((link) => link.kind === kind && link.id === id);
  const linkableEncounters = encounters.filter(
    (encounter) => encounter.id !== attached?.id && !has("encounter", encounter.id),
  );
  const linkableSeats = party.filter((row) => !has("seat", row.seat.id));

  const add = (link: NoteLink) => {
    const params = { campaignId, noteId: note.id };
    void submit(
      (client) =>
        // Split by kind: the derived client takes each member of the union on
        // its own, not the union itself.
        link.kind === "encounter"
          ? client.notes.addLink({ params, payload: link })
          : client.notes.addLink({ params, payload: link }),
      [reads.notes(campaignId)],
    );
  };
  const remove = (link: NoteLink) =>
    void submit(
      (client) =>
        client.notes.removeLink({
          params: { campaignId, noteId: note.id, kind: link.kind, targetId: link.id },
        }),
      [reads.notes(campaignId)],
    );

  return (
    <div
      data-slot="note-links"
      className="flex flex-col gap-2.5 border-t border-hairline px-6 pt-4 pb-5"
    >
      <span
        id="note-linked"
        className="text-caption leading-none font-medium text-muted-foreground"
      >
        Linked
      </span>
      <ul
        aria-labelledby="note-linked"
        className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0"
      >
        {attached !== undefined && (
          <li>
            <Chip label={attached.name} title="Attached — change it under Attached to">
              <Link
                to="/campaigns/$campaignId/encounters"
                params={{ campaignId }}
                search={{ encounter: attached.id }}
                aria-label={`Attached to ${attached.name}`}
                className={chipLink}
              >
                <ChipFace icon="swords" label={attached.name} />
              </Link>
            </Chip>
          </li>
        )}
        {linked.map(({ link, label }) => (
          <li key={`${link.kind}:${link.id}`}>
            <Chip label={label} onRemove={() => remove(link)} busy={busy}>
              {link.kind === "encounter" ? (
                <Link
                  to="/campaigns/$campaignId/encounters"
                  params={{ campaignId }}
                  search={{ encounter: link.id }}
                  className={chipLink}
                >
                  <ChipFace icon="swords" label={label} />
                </Link>
              ) : (
                <Link
                  to="/campaigns/$campaignId/party/$seatId"
                  params={{ campaignId, seatId: link.id }}
                  className={chipLink}
                >
                  <ChipFace icon="shield" label={label} />
                </Link>
              )}
            </Chip>
          </li>
        ))}
        {attached === undefined && linked.length === 0 && (
          <li className="text-body-s leading-snug text-faint">Not linked to anything yet.</li>
        )}
        <li>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy || (linkableEncounters.length === 0 && linkableSeats.length === 0)}
              render={<Button variant="outline" size="sm" className="h-control-sm" />}
            >
              <Icon name="link" size={13} className="pointer-events-none" />
              Link…
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {linkableEncounters.length > 0 && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Encounters</DropdownMenuLabel>
                  {linkableEncounters.map((encounter) => (
                    <DropdownMenuItem
                      key={encounter.id}
                      onClick={() => add({ kind: "encounter", id: encounter.id })}
                    >
                      <Icon name="swords" size={14} className="pointer-events-none" />
                      {encounter.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )}
              {linkableSeats.length > 0 && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Party</DropdownMenuLabel>
                  {linkableSeats.map(({ seat }) => (
                    <DropdownMenuItem
                      key={seat.id}
                      onClick={() => add({ kind: "seat", id: seat.id })}
                    >
                      <Icon name="shield" size={14} className="pointer-events-none" />
                      {seat.displayName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}

/**
 * One chip: the drawing's 30px outline tag. Its name is a link to what it
 * names (`children`, the router `Link` wearing `chipLink` around `ChipFace`);
 * the × is a separate button beside it, never inside the link, so pressing it
 * removes and does not navigate.
 */
function Chip({
  title,
  label,
  onRemove,
  busy = false,
  children,
}: {
  readonly title?: string;
  /** What the × says it removes. */
  readonly label: string;
  /** Absent for the attachment, which *Attached to* clears. */
  readonly onRemove?: () => void;
  readonly busy?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <span
      data-slot="note-link-chip"
      title={title}
      className="inline-flex h-control-sm max-w-full items-stretch rounded-sm border border-strong text-label leading-none font-medium text-foreground"
    >
      {children}
      {onRemove !== undefined && (
        <button
          type="button"
          aria-label={`Unlink ${label}`}
          disabled={busy}
          onClick={onRemove}
          className="flex cursor-pointer items-center rounded-sm border-0 bg-transparent px-1.5 text-muted-foreground transition-control outline-none hover:bg-surface-raised hover:text-foreground focus-visible:ring-focus disabled:cursor-default disabled:opacity-50"
        >
          <Icon name="x" size={13} className="pointer-events-none" />
        </button>
      )}
    </span>
  );
}

const chipLink =
  "flex min-w-0 items-center gap-1.5 rounded-sm px-2.5 text-inherit no-underline transition-control outline-none hover:bg-surface-raised focus-visible:ring-focus";

function ChipFace({ icon, label }: { readonly icon: IconName; readonly label: string }) {
  return (
    <>
      <Icon name={icon} size={13} className="pointer-events-none shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </>
  );
}
