import type { CampaignId, Character, Note } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Badge, Card, CardContent, CardHeader, CardTitle, Icon } from "@taverns/ui";
import { Atom } from "effect/unstable/reactivity";
import { apiAtom, useApiAtom } from "../api/atoms";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadPlayerCampaignView } from "./load";

/**
 * A table you sit at — **the first screen in the product that is not the DM's.**
 *
 * It exists because the role switch is a mode rather than a filter, and a mode
 * means the two sides may diverge freely: this owes nothing to
 * `CampaignScreen`, is not that screen with rows hidden, and shares no component
 * with it. What it shares is the shell, the load rule and the three states.
 *
 * **Nothing on it can fail for the audience it is for.** Every read behind it is
 * one a player may make (see `load.ts`); there is no tab a player cannot open,
 * no control that would 404, and no *Ask Hob* — the shell drops that in player
 * mode, because asking is a write and the captain settled that players do not.
 *
 * It is deliberately small. The character sheet, the record and the player's
 * live table are three screens with three steps of their own; drawing a
 * placeholder for any of them here would be the stubbed field the screens rule
 * forbids. What a player has today is who is at the table and what the DM chose
 * to share, so that is what this says, and it says so in as many words.
 */

/**
 * One character, read-only.
 *
 * Not `PartyList`: that row carries a pencil and a `Shared` badge, and both are
 * the DM's questions. A player is answered only their own row and the shared
 * ones, so "shared" is true of nearly everything here and would say nothing —
 * the rule a `Player` badge on every row of a mode's list falls to as well.
 */
function PartyMember({ character }: { readonly character: Character }) {
  const detail = [character.descriptor, character.playerName].filter(
    (part): part is string => part !== null && part !== "",
  );

  return (
    <div className="flex min-h-row flex-wrap items-center gap-2.5 border-t border-hairline px-card py-2 first:border-t-0">
      <Icon name="shield" size={15} className="text-faint" />
      <span className="text-body-s leading-body text-foreground">{character.name}</span>
      {detail.length > 0 && (
        <span className="text-body-s leading-body text-muted-foreground">{detail.join(" · ")}</span>
      )}
      <span className="ml-auto flex items-center gap-4">
        {character.conditions.map((condition) => (
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
  apiAtom(loadPlayerCampaignView(campaignId)),
);

export function PlayerCampaignScreen() {
  const { campaignId } = useParams({ from: "/play/campaigns/$campaignId" });
  const [resource, reload] = useApiAtom(playerCampaignAtom(campaignId));

  const view = resource.state === "ready" ? resource.value : undefined;
  const empty = view !== undefined && view.party.length === 0 && view.notes.length === 0;

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
        />
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
                    {view.party.map((character) => (
                      <PartyMember key={character.id} character={character} />
                    ))}
                  </Card>
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
