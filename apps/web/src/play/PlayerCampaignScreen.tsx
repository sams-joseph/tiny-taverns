import type { CampaignId, Note, PartySeat } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadPlayerCampaignView } from "./load";

/**
 * A table you sit at, in the player projection of one campaign.
 *
 * Navigation has no global mode now: this screen is chosen by the reader's
 * relation to the campaign in the URL, and it is not the DM screen with rows
 * hidden. What it shares is the shell, the load rule and the three states.
 *
 * **Nothing on it can fail for the audience it is for.** Every read behind it is
 * one a player may make (see `load.ts`); there is no tab a player cannot open,
 * no control that would 404, and no docked *Ask Hob* panel — a player's Hob
 * surface is the character-drafting composer, not the DM's session-writing
 * chat.
 *
 * It is deliberately small. The character sheet, the Chronicle and the live
 * table are separate screens with their own narrow projections; drawing a
 * placeholder for any of them here would be the stubbed field the screens rule
 * forbids. What this overview has is who the DM shared with the table and what
 * prose the DM chose to share, so that is what this says.
 *
 * **One control writes, and it is only the door into the create flow.** *New
 * character* goes to `#/campaigns/:c/characters/new` because this screen is
 * already at one table. Creating the character does **not** seat it here; table
 * presence is the explicit `campaign_character` row created by the party-join
 * flow, so this link makes an owned character and nothing more.
 */

/**
 * One character, read-only.
 *
 * Not `PartyList`: that row carries a pencil and a `Shared` badge, and both are
 * the DM's questions. A player is answered only their own row and the shared
 * ones, so "shared" is true of nearly everything here and would say nothing —
 * the rule a `Player` badge on every row of a mode's list falls to as well.
 */
function PartyMember({ seat }: { readonly seat: PartySeat }) {
  const character = seat.character;
  const detail = [
    character?.descriptor ?? null,
    seat.seat.playerDisplayName ?? character?.playerName ?? null,
  ].filter((part): part is string => part !== null && part !== "");

  return (
    <div className="flex min-h-row flex-wrap items-center gap-2.5 border-t border-hairline px-card py-2 first:border-t-0">
      <Icon name="shield" size={15} className="text-faint" />
      <span className="text-body-s leading-body text-foreground">
        {character?.name ?? seat.seat.displayName}
      </span>
      {detail.length > 0 && (
        <span className="text-body-s leading-body text-muted-foreground">{detail.join(" · ")}</span>
      )}
      <span className="ml-auto flex items-center gap-4">
        {(character?.conditions ?? []).map((condition) => (
          <Badge key={condition} variant="secondary">
            {condition}
          </Badge>
        ))}
      </span>
    </div>
  );
}

/**
 * A note the DM shared.
 *
 * Read-aloud keeps its register — italic Alegreya at `--fs-body-l`, the one
 * place in the product whose prose is not UI voice — because that is precisely
 * the text this audience is here to read.
 */
function SharedNote({ note }: { readonly note: Note }) {
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
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-subtitle leading-snug font-semibold tracking-display text-heading">
        {title}
      </h2>
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
  ]),
);

export function PlayerCampaignScreen({ campaignId }: { readonly campaignId: CampaignId }) {
  const [resource, reload] = useApiAtom(playerCampaignAtom(campaignId));

  const view = resource.state === "ready" ? resource.value : undefined;
  const empty =
    view !== undefined &&
    view.party.length === 0 &&
    view.notes.length === 0 &&
    view.npcs.length === 0;

  return (
    <AppShell
      campaignName={view?.campaign.name}
      topBar={
        <TopBar
          title={view?.campaign.name ?? "A table"}
          subtitle={
            view === undefined
              ? undefined
              : view.campaign.partyName !== null && view.campaign.partyName !== ""
                ? view.campaign.partyName
                : "You are at this table."
          }
        >
          <Button
            size="sm"
            nativeButton={false}
            render={<Link to="/campaigns/$campaignId/characters/new" params={{ campaignId }} />}
          >
            <Icon name="user-plus" size={14} />
            New character
          </Button>
        </TopBar>
      }
    >
      <div className="flex flex-col gap-8">
        {resource.state === "loading" && <Loading label="Reading the table…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={reload} />
        )}

        {view !== undefined &&
          (empty ? (
            // The ordinary outcome of joining, and the one the invitation page
            // already warns about: a campaign a DM has shared but has put
            // nothing shared inside. It is the master toggle and the row-level
            // one working in sequence, not a gap, so it says which.
            <EmptyState icon="eye-off" title="Nothing shared yet">
              Your DM decides what the table can read. Whatever they share — the party, the
              read-aloud text — appears here.
            </EmptyState>
          ) : (
            <>
              {view.party.length > 0 && (
                <Section title="The party">
                  <Card>
                    {view.party.map((seat) => (
                      <PartyMember key={seat.seat.id} seat={seat} />
                    ))}
                  </Card>
                </Section>
              )}

              {view.npcs.length > 0 && (
                <Section title="People you can talk to">
                  <p className="text-body-s leading-body text-muted-foreground">
                    Talk privately opens your own conversation with a player-facing NPC. Only you
                    can read that transcript, and it does not automatically update NPC memory.
                  </p>
                  <div className="grid gap-4 @3xl:grid-cols-2">
                    {view.npcs.map((npc) => (
                      <Card key={npc.id}>
                        <CardHeader>
                          <CardTitle>{npc.name}</CardTitle>
                          {npc.role !== "" && (
                            <p className="text-body-s leading-body text-muted-foreground">
                              {npc.role}
                            </p>
                          )}
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                          {npc.persona.identity?.summary !== undefined && (
                            <p className="text-body-s leading-body text-foreground">
                              {npc.persona.identity.summary}
                            </p>
                          )}
                          <Button
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
                <Section title="Shared with you">
                  <div className="flex flex-col gap-4">
                    {view.notes.map((note) => (
                      <SharedNote key={note.id} note={note} />
                    ))}
                  </div>
                </Section>
              )}
            </>
          ))}
      </div>
    </AppShell>
  );
}
