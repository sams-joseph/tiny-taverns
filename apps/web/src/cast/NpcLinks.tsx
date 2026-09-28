import type {
  CampaignId,
  Encounter,
  Note,
  NpcId,
  NpcLink,
  PartySeat,
  Session,
  SessionId,
} from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Icon, Toggle } from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { SaveFailure } from "../ui/form";
import { LinkChip, LinkChipFace, linkChipClassName, LinkMenu } from "../ui/links";
import { npcLinksAtom } from "./load";
import { nightLabel } from "./prep";

/**
 * The drawer's *Tied to* and *Shows up in*: what the NPC is bound up with, as
 * the drawing draws them under the secret. Both are the DM's prep and never a
 * player's — no player read joins a link (`NpcLink`, `NoteLink`).
 *
 * ***Tied to*** is a toggle per seat at the table (`party.list`, the seats
 * still seated), lit while the NPC has a seat link. Pressing one adds or
 * removes that link at once (`npcs.addLink` / `npcs.removeLink`).
 *
 * ***Shows up in*** is chips, each opening what it names:
 * - **the nights the NPC was at the table** (`NpcPrep.tableNights`), derived
 *   from its live-session conversations and never typed — so they have no ×,
 *   and the drawing's surname match is not how they are found. Each opens its
 *   night on the Chronicle.
 * - **the encounters the DM linked** (`npcs.addLink`), each opening the
 *   encounter selected on the Encounters tab.
 * - **the notes that link this NPC** — the notes' own links (`NoteLink` of
 *   kind `npc`), read from the notes list the campaign frame already holds, so
 *   a link made from a note's pane shows here and one made here shows there.
 *   Each opens its note on the Notes tab.
 *
 * Encounters and notes each have a × and are added from the *Link…* menu. None
 * of these writes is an edit of the NPC: they go at once, not through the
 * drawer's autosave, and name what they changed — `npcLinks` for the NPC's own
 * links, `notes` for a note's.
 *
 * **A chip or a toggle is drawn only while its target is in what the frame
 * read.** A retired seat's tie stays in the record and draws no toggle, and a
 * deleted night draws no chip.
 */
export function NpcLinks({
  campaignId,
  npcId,
  tableNights,
  nights,
  encounters,
  notes,
  party,
}: {
  readonly campaignId: CampaignId;
  readonly npcId: NpcId;
  /** The nights the NPC was opened at the table, oldest first. */
  readonly tableNights: ReadonlyArray<SessionId>;
  /** Every night of the campaign, to name the table nights. */
  readonly nights: ReadonlyArray<Session>;
  readonly encounters: ReadonlyArray<Encounter>;
  readonly notes: ReadonlyArray<Note>;
  readonly party: ReadonlyArray<PartySeat>;
}) {
  const [read] = useApiAtom(npcLinksAtom({ campaignId, npcId }));
  const { busy, failure, submit } = useMutation();

  if (read.state === "loading") return null;
  if (read.state === "failed") return <SaveFailure failure={read.failure} />;
  const links = read.value.links;

  const has = (kind: NpcLink["kind"], id: string) =>
    links.some((link) => link.kind === kind && link.id === id);
  const names = (note: Note) => note.links.some((link) => link.kind === "npc" && link.id === npcId);

  const params = { campaignId, npcId };
  const addLink = (link: NpcLink) =>
    void submit(
      (client) =>
        // Split by kind: the derived client takes each member of the union on
        // its own, not the union itself.
        link.kind === "encounter"
          ? client.npcs.addLink({ params, payload: link })
          : client.npcs.addLink({ params, payload: link }),
      [reads.npcLinks(npcId)],
    );
  const removeLink = (link: NpcLink) =>
    void submit(
      (client) =>
        client.npcs.removeLink({ params: { ...params, kind: link.kind, targetId: link.id } }),
      [reads.npcLinks(npcId)],
    );
  const linkNote = (note: Note) =>
    void submit(
      (client) =>
        client.notes.addLink({
          params: { campaignId, noteId: note.id },
          payload: { kind: "npc", id: npcId },
        }),
      [reads.notes(campaignId)],
    );
  const unlinkNote = (note: Note) =>
    void submit(
      (client) =>
        client.notes.removeLink({
          params: { campaignId, noteId: note.id, kind: "npc", targetId: npcId },
        }),
      [reads.notes(campaignId)],
    );

  const atTable = tableNights.flatMap((id) => nights.filter((night) => night.id === id));
  const linkedEncounters = links.flatMap((link) =>
    link.kind === "encounter" ? encounters.filter((encounter) => encounter.id === link.id) : [],
  );
  const linkedNotes = notes.filter(names);
  const nothing = atTable.length === 0 && linkedEncounters.length === 0 && linkedNotes.length === 0;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span id="npc-drawer-ties" className="font-sans text-label leading-snug font-medium">
          Tied to
        </span>
        {party.length === 0 ? (
          <p className="m-0 text-body-s leading-snug text-faint">
            Nobody is seated at this table yet.
          </p>
        ) : (
          <div role="group" aria-labelledby="npc-drawer-ties" className="flex flex-wrap gap-1.5">
            {party.map(({ seat }) => (
              <Toggle
                key={seat.id}
                size="sm"
                className="rounded-pill"
                disabled={busy}
                pressed={has("seat", seat.id)}
                onPressedChange={(pressed) =>
                  pressed
                    ? addLink({ kind: "seat", id: seat.id })
                    : removeLink({ kind: "seat", id: seat.id })
                }
              >
                <Icon name="shield" size={13} />
                {seat.displayName}
              </Toggle>
            ))}
          </div>
        )}
      </div>

      <div data-slot="npc-links" className="flex flex-col gap-1.5 border-t border-hairline pt-3.5">
        <span id="npc-drawer-appears" className="font-sans text-label leading-snug font-medium">
          Shows up in
        </span>
        <ul
          aria-labelledby="npc-drawer-appears"
          className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0"
        >
          {atTable.map((night) => (
            <li key={night.id}>
              <LinkChip label={nightLabel(night)} title="At the table that night">
                <Link
                  to="/campaigns/$campaignId/chronicle"
                  params={{ campaignId }}
                  search={{ session: night.id }}
                  className={linkChipClassName}
                >
                  <LinkChipFace icon="book-open" label={nightLabel(night)} />
                </Link>
              </LinkChip>
            </li>
          ))}
          {linkedEncounters.map((encounter) => (
            <li key={encounter.id}>
              <LinkChip
                label={encounter.name}
                busy={busy}
                onRemove={() => removeLink({ kind: "encounter", id: encounter.id })}
              >
                <Link
                  to="/campaigns/$campaignId/encounters"
                  params={{ campaignId }}
                  search={{ encounter: encounter.id }}
                  className={linkChipClassName}
                >
                  <LinkChipFace icon="swords" label={encounter.name} />
                </Link>
              </LinkChip>
            </li>
          ))}
          {linkedNotes.map((note) => (
            <li key={note.id}>
              <LinkChip label={note.title} busy={busy} onRemove={() => unlinkNote(note)}>
                <Link
                  to="/campaigns/$campaignId/notes"
                  params={{ campaignId }}
                  search={{ note: note.id }}
                  className={linkChipClassName}
                >
                  <LinkChipFace icon="scroll-text" label={note.title} />
                </Link>
              </LinkChip>
            </li>
          ))}
          {nothing && (
            <li className="text-body-s leading-snug text-faint">
              Not at the table, in an encounter or in a note yet.
            </li>
          )}
          <li>
            <LinkMenu
              busy={busy}
              groups={[
                {
                  label: "Encounters",
                  icon: "swords",
                  items: encounters
                    .filter((encounter) => !has("encounter", encounter.id))
                    .map((encounter) => ({
                      key: encounter.id,
                      label: encounter.name,
                      onSelect: () => addLink({ kind: "encounter", id: encounter.id }),
                    })),
                },
                {
                  label: "Notes",
                  icon: "scroll-text",
                  items: notes
                    .filter((note) => !names(note))
                    .map((note) => ({
                      key: note.id,
                      label: note.title,
                      onSelect: () => linkNote(note),
                    })),
                },
              ]}
            />
          </li>
        </ul>
        {failure !== undefined && <SaveFailure failure={failure} />}
      </div>
    </>
  );
}
