import type {
  CampaignId,
  Encounter,
  Note,
  NoteAttachment,
  NoteLink,
  Npc,
  PartySeat,
} from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { LinkChip, LinkChipFace, linkChipClassName, LinkMenu } from "../ui/links";

/**
 * The pane's *Linked* footer, as the drawing draws it: a chip for each thing
 * the note is about, and each chip opens it — an encounter selected on the
 * Encounters tab, a seat on its own page, an NPC in its drawer on the Cast.
 *
 * **The attachment is the first chip.** It is the read-aloud's one encounter
 * (`attachedTo`), not a link: it is chosen and cleared under *Attached to*, so
 * its chip opens the encounter and has no remove ×. Every other chip is a
 * `note_link`, removed by its own × (`notes.removeLink`) and added from the
 * *Link…* menu (`notes.addLink`), which offers the campaign's encounters,
 * seats and NPCs the note is not already on. Neither write is an edit of the
 * note: they go at once, not through the pane's autosave, and name
 * `reads.notes`, the only read that carries links — the Cast's *Shows up in*
 * reads an NPC's notes from the same list.
 *
 * **A chip is drawn only while its target is in what the frame read.** A
 * deleted encounter's link is gone with it (the key cascades), but a retired
 * seat's link and an archived NPC's stay in the record, and neither could be
 * opened from here.
 */

export function NoteLinks({
  campaignId,
  note,
  attachedTo,
  encounters,
  party,
  npcs,
}: {
  readonly campaignId: CampaignId;
  /** The note as the server last answered it: its links. */
  readonly note: Note;
  /** The draft's attachment, so the chip follows *Attached to* at once. */
  readonly attachedTo: NoteAttachment | null;
  readonly encounters: ReadonlyArray<Encounter>;
  readonly party: ReadonlyArray<PartySeat>;
  /** The cast: every NPC not archived. */
  readonly npcs: ReadonlyArray<Npc>;
}) {
  const { busy, failure, submit } = useMutation();
  const encounterOf = (id: string) => encounters.find((encounter) => encounter.id === id);
  const seatOf = (id: string) => party.find((row) => row.seat.id === id)?.seat;
  const npcOf = (id: string) => npcs.find((npc) => npc.id === id);

  const attached = attachedTo === null ? undefined : encounterOf(attachedTo.id);
  const linked = note.links.flatMap((link) => {
    const label =
      link.kind === "encounter"
        ? encounterOf(link.id)?.name
        : link.kind === "seat"
          ? seatOf(link.id)?.displayName
          : npcOf(link.id)?.name;
    return label === undefined ? [] : [{ link, label }];
  });

  const has = (kind: NoteLink["kind"], id: string) =>
    note.links.some((link) => link.kind === kind && link.id === id);
  const linkableEncounters = encounters.filter(
    (encounter) => encounter.id !== attached?.id && !has("encounter", encounter.id),
  );
  const linkableSeats = party.filter((row) => !has("seat", row.seat.id));
  const linkableNpcs = npcs.filter((npc) => !has("npc", npc.id));

  const add = (link: NoteLink) => {
    const params = { campaignId, noteId: note.id };
    void submit(
      (client) =>
        // Split by kind: the derived client takes each member of the union on
        // its own, not the union itself.
        link.kind === "encounter"
          ? client.notes.addLink({ params, payload: link })
          : link.kind === "seat"
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
            <LinkChip label={attached.name} title="Attached — change it under Attached to">
              <Link
                to="/campaigns/$campaignId/encounters"
                params={{ campaignId }}
                search={{ encounter: attached.id }}
                aria-label={`Attached to ${attached.name}`}
                className={linkChipClassName}
              >
                <LinkChipFace icon="swords" label={attached.name} />
              </Link>
            </LinkChip>
          </li>
        )}
        {linked.map(({ link, label }) => (
          <li key={`${link.kind}:${link.id}`}>
            <LinkChip label={label} onRemove={() => remove(link)} busy={busy}>
              {link.kind === "encounter" ? (
                <Link
                  to="/campaigns/$campaignId/encounters"
                  params={{ campaignId }}
                  search={{ encounter: link.id }}
                  className={linkChipClassName}
                >
                  <LinkChipFace icon="swords" label={label} />
                </Link>
              ) : link.kind === "seat" ? (
                <Link
                  to="/campaigns/$campaignId/party/$seatId"
                  params={{ campaignId, seatId: link.id }}
                  className={linkChipClassName}
                >
                  <LinkChipFace icon="shield" label={label} />
                </Link>
              ) : (
                <Link
                  to="/campaigns/$campaignId/cast"
                  params={{ campaignId }}
                  search={{ npc: link.id }}
                  className={linkChipClassName}
                >
                  <LinkChipFace icon="user-round" label={label} />
                </Link>
              )}
            </LinkChip>
          </li>
        ))}
        {attached === undefined && linked.length === 0 && (
          <li className="text-body-s leading-snug text-faint">Not linked to anything yet.</li>
        )}
        <li>
          <LinkMenu
            busy={busy}
            groups={[
              {
                label: "Encounters",
                icon: "swords",
                items: linkableEncounters.map((encounter) => ({
                  key: encounter.id,
                  label: encounter.name,
                  onSelect: () => add({ kind: "encounter", id: encounter.id }),
                })),
              },
              {
                label: "Party",
                icon: "shield",
                items: linkableSeats.map(({ seat }) => ({
                  key: seat.id,
                  label: seat.displayName,
                  onSelect: () => add({ kind: "seat", id: seat.id }),
                })),
              },
              {
                label: "Cast",
                icon: "user-round",
                items: linkableNpcs.map((npc) => ({
                  key: npc.id,
                  label: npc.name,
                  onSelect: () => add({ kind: "npc", id: npc.id }),
                })),
              },
            ]}
          />
        </li>
      </ul>
      {failure !== undefined && <SaveFailure failure={failure} />}
    </div>
  );
}
