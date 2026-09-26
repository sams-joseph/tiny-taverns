import type { CampaignId, PlayerNote } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icon,
  SectionHeading,
  EmptyState,
  Loading,
} from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { NpcAppearance } from "../cast/NpcAppearance";
import { NpcAvatar } from "../cast/NpcAvatar";
import { CampaignHero } from "../campaign/CampaignHero";
import { LastTime } from "../campaign/LastTime";
import { OverviewPage, SHARED_NOTES } from "../campaign/OverviewParts";
import { PartyCard } from "../campaign/PartyCard";
import { RecentNotes } from "../campaign/RecentNotes";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { TopBar } from "../shell/TopBar";
import { loadPlayerCampaignView } from "./load";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

/**
 * A table you sit at, in the player projection of one campaign.
 *
 * Navigation has no global mode now: this screen is chosen by the reader's
 * relation to the campaign in the URL, and it is not the DM screen with rows
 * hidden. What it shares with the creator's Overview is the layout and the
 * cards — the hero, the two columns, *Last time*, *Party*, *Recent notes*
 * (`campaign/CampaignScreen.tsx`), each told it is drawing for a player — and
 * never the load: every read behind it is one a player may make (`load.ts`).
 *
 * **Nothing on it can fail for the audience it is for.** There is no tab a
 * player cannot open, no control that would 404, and no docked *Ask Hob* panel
 * — a player's Hob surface is the character-drafting composer, not the DM's
 * session-writing chat.
 *
 * The main column is what the DM shared for reading: the last night, the
 * people the table can talk to, and the notes in full. The aside is the
 * table: the seats this player may see, and the notes touched last. The
 * creator's *Next session* is prep, which is the DM's, and *Open threads* and
 * *At the table* are left out on both pages (the captain's answers 5 and 7).
 *
 * **One control writes, and it is only the door into the create flow.** *New
 * character* — the page's one peach, in the hero where the creator's
 * management sits — goes to `/campaigns/:c/characters/new` because this screen
 * is already at one table. Creating the character does **not** seat it here;
 * table presence is the explicit `campaign_character` row created by the
 * party-join flow, so this link makes an owned character and nothing more.
 */

/**
 * A note the DM shared.
 *
 * Read-aloud keeps its register — italic Alegreya at `--fs-body-l`, the one
 * place in the product whose prose is not UI voice — because that is precisely
 * the text this audience is here to read.
 */
function SharedNote({ note }: { readonly note: PlayerNote }) {
  const readAloud = note.kind === "read_aloud";

  return (
    <Card>
      <CardHeader>
        {readAloud && (
          <span className="text-caption leading-snug font-medium tracking-caps uppercase text-faint">
            Read aloud
          </span>
        )}
        <CardTitle>{note.title}</CardTitle>
      </CardHeader>
      {note.body !== "" && (
        <CardContent>
          <p
            className={
              readAloud
                ? "max-w-measure font-serif text-body-l leading-loose font-normal text-slate-300 italic"
                : "max-w-measure text-body leading-body text-foreground"
            }
          >
            {note.body}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function Section({
  title,
  id,
  children,
}: {
  readonly title: string;
  readonly id?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-(--chrome-height) flex-col gap-3">
      <SectionHeading size="subtitle">{title}</SectionHeading>
      {children}
    </section>
  );
}

/**
 * A table this account only sits at, keyed on the campaign.
 */
const playerCampaignAtom = Atom.family((campaignId: CampaignId) =>
  // One atom rather than three, and the keys are the reads it makes: a player
  // writes nothing here, so this list exists to keep the screen honest if a DM
  // in another tab does — and to say which reads it is, which is the question
  // every atom in this app answers.
  apiAtom(loadPlayerCampaignView(campaignId), [
    reads.campaign(campaignId),
    reads.party(campaignId),
    reads.notes(campaignId),
    reads.npcs(campaignId),
    reads.sessions(campaignId),
  ]),
);

export function PlayerCampaignScreen({ campaignId }: { readonly campaignId: CampaignId }) {
  const [resource, reload] = useApiAtom(playerCampaignAtom(campaignId));

  const view = resource.state === "ready" ? resource.value : undefined;
  // A player can arrive while the cover, or a shared NPC's portrait, is still
  // being drawn; re-read until it lands.
  useHobDrawingPolling(
    view !== undefined && (view.campaign.imagePending || view.npcs.some((npc) => npc.imagePending)),
    reload,
  );
  const empty =
    view !== undefined &&
    view.party.length === 0 &&
    view.notes.length === 0 &&
    view.npcs.length === 0 &&
    view.lastNight === undefined;

  const newCharacter = (
    <Button
      size="sm"
      nativeButton={false}
      render={<Link to="/campaigns/$campaignId/characters/new" params={{ campaignId }} />}
    >
      <Icon name="user-plus" size={14} />
      New character
    </Button>
  );

  if (view === undefined) {
    // The hero's `h1` is the campaign's name, which is not known yet: until it
    // is, the tab's ordinary header holds the page's title and its one verb.
    return (
      <>
        <TopBar title="A table">{newCharacter}</TopBar>
        {resource.state === "failed" ? (
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        ) : (
          <Loading label="Reading the table…" />
        )}
      </>
    );
  }

  return (
    <OverviewPage
      lead={<CampaignHero campaign={view.campaign}>{newCharacter}</CampaignHero>}
      main={
        <>
          {view.lastNight !== undefined && (
            <LastTime lastNight={view.lastNight} campaignId={campaignId} audience="player" />
          )}

          {empty && (
            // The ordinary outcome of joining, and the one the invitation page
            // already warns about: a campaign a DM has shared but has put
            // nothing shared inside. It is the master toggle and the row-level
            // one working in sequence, not a gap, so it says which.
            <EmptyState icon="eye-off" title="Nothing shared yet">
              Your DM decides what the table can read. Whatever they share — the party, the
              read-aloud text — appears here.
            </EmptyState>
          )}

          {view.npcs.length > 0 && (
            <Section title="People you can talk to">
              <p className="text-body-s leading-body text-muted-foreground">
                Talk privately opens your own conversation with a player-facing NPC. Only you can
                read that transcript, and it does not automatically update NPC memory.
              </p>
              <div className="grid gap-4 @2xl:grid-cols-2">
                {view.npcs.map((npc) => (
                  <Card key={npc.id}>
                    <CardHeader>
                      <div className="flex items-start gap-2.5">
                        <NpcAvatar name={npc.name} image={npc.image} />
                        <div className="min-w-0 flex-1">
                          <CardTitle>{npc.name}</CardTitle>
                          {npc.role !== "" && (
                            <p className="text-body-s leading-body text-muted-foreground">
                              {npc.role}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {npc.persona.identity?.summary !== undefined && (
                        <p className="text-body-s leading-body text-foreground">
                          {npc.persona.identity.summary}
                        </p>
                      )}
                      <NpcAppearance appearance={npc.persona.identity?.appearance} />
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link
                            to="/campaigns/$campaignId/cast/$npcId/talk"
                            params={{ campaignId, npcId: npc.id }}
                          />
                        }
                      >
                        <Icon name="mic" size={14} />
                        Talk privately
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </Section>
          )}

          {view.notes.length > 0 && (
            <Section title="Shared with you" id={SHARED_NOTES}>
              <div className="flex flex-col gap-4">
                {view.notes.map((note) => (
                  <SharedNote key={note.id} note={note} />
                ))}
              </div>
            </Section>
          )}
        </>
      }
      aside={
        <>
          <PartyCard party={view.party} campaignId={campaignId} audience="player" />
          {/* Only with notes to summarise: its *All notes* is the section above,
              which is drawn only then. */}
          {view.notes.length > 0 && (
            <RecentNotes notes={view.notes} campaignId={campaignId} audience="player" />
          )}
        </>
      }
    />
  );
}
