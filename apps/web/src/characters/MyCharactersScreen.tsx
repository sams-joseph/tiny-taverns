import type { Character } from "@taverns/api";
import { Button, Card, CardContent, Icon } from "@taverns/ui";
import type { Route } from "../routes";
import { useApiResource } from "../api/resource";
import { hrefFor } from "../routes";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadMyCharacters, type MyCharactersView } from "./load";
import { hitPoints, rosterSummary } from "./sheet";
import { Portrait, StatPill } from "./SheetParts";

/**
 * Your characters — `ui_kits/dm-screen/MyCharacters.jsx` against the real API,
 * and the first screen in the product that is about a *person* rather than a
 * table.
 *
 * `GET /me/characters` is the one read on `character` that names no campaign, so
 * this is the one screen that shows a player everything they play at once. What
 * it can say about each of them is bounded by that: the row carries the campaign
 * as an id, and `GET /me/campaigns` is what turns it into a name (`load.ts`).
 *
 * ### What the drawing has that this does not
 *
 * Four things come out, each because there is nothing behind it:
 *
 * - **The live banner** — *"The Salt Road is playing right now · session 12 ·
 *   round 3 · Brannoc is up next"*, with a *Take your turn* button. **It has no
 *   read behind it.** It is three campaign-scoped reads a player is partly
 *   refused plus the player projection of a fight, which is not built; the
 *   projection is step 12's decision and inventing one here would settle it by
 *   accident. So the banner is absent, and so is the button that goes to a
 *   screen that does not exist.
 * - **A character with no campaign.** The drawing has an *unassigned* card
 *   reading *"Not in a campaign yet"*. `character.campaign_id` is `not null`, so
 *   the state is not representable — bringing a character to a second table is a
 *   copy, shaped like `creatures/:id/derive`, and it is not built.
 * - **The join card** — paste a code, *Claim a seat*. Following an invitation is
 *   `#/join/<token>`, a screen that already exists and reads the invitation
 *   before anybody signs in. A second, weaker way in would be a second answer to
 *   what an invitation is.
 * - **Every control that writes.** *New character*, *Send to the DM*, the
 *   portrait upload. A player cannot write anything yet — `ownedRowWritable`
 *   deliberately does not exist — and characters are made by the DM, in
 *   `campaign/CharacterDialog.tsx`.
 *
 * A *Playing* badge goes too, and for the list's own rule rather than the data's:
 * every character here is in a campaign, so a badge on all of them would say
 * nothing. Same reason the `Player` badge left the campaign rows when the role
 * became a mode.
 */

function CharacterCard({
  character,
  campaignName,
}: {
  readonly character: Character;
  readonly campaignName: string | undefined;
}) {
  const hp = hitPoints(character.hpCurrent, character.hpMax);

  return (
    <Card className="h-full">
      <CardContent className="flex flex-1 flex-col gap-3 pt-card">
        <div className="flex items-start gap-3">
          <Portrait name={character.name} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-body leading-tight font-semibold text-heading">
              {character.name}
            </p>
            {character.descriptor !== null && character.descriptor !== "" && (
              <p className="mt-1 text-caption leading-body text-muted-foreground">
                {character.descriptor}
              </p>
            )}
          </div>
        </div>

        {/* Only the numbers the row actually holds. `hpMax` and `ac` are
            nullable and `level` is too, so a pill for each is a pill that could
            be a stubbed zero — the one thing the screens rule forbids.

            Three fixed columns rather than a flex row, because the vocabulary is
            fixed at three: a card with one number keeps that number a third of
            the card wide, where flexing would stretch a lone `Level` across the
            whole of it and read as the card's headline. */}
        {(hp !== undefined || character.ac !== null || character.level !== null) && (
          <div className="grid grid-cols-3 gap-1.5">
            {hp !== undefined && <StatPill label="HP" value={hp} />}
            {character.ac !== null && <StatPill label="AC" value={character.ac} />}
            {character.level !== null && <StatPill label="Level" value={character.level} />}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Icon name="book-open" size={14} className="shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1 truncate text-caption leading-body text-foreground">
            {/* The campaign is always there — it is a `not null` column — but its
                *name* comes from a second read, and a membership that has been
                revoked since would leave the id unnamed. Saying so beats an
                empty line. */}
            {campaignName ?? "A table you have left"}
          </span>
        </div>

        <Button
          className="mt-auto w-full"
          size="sm"
          nativeButton={false}
          render={<a href={hrefFor({ screen: "playCharacter", characterId: character.id })} />}
        >
          Open sheet
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Two silences, told apart — and neither of them papered over.
 *
 * An empty roster is exactly what it says: this account owns no character row.
 * Which of the two reasons it is depends on whether the account sits at a table
 * at all, and that is `GET /me/campaigns`, which `load.ts` already read.
 */
function NothingYet({ view }: { readonly view: MyCharactersView }) {
  return view.tableCount === 0 ? (
    <EmptyState icon="user" title="No characters yet">
      Nobody has invited you to a table. Follow the link your DM sends you, and whatever they hand
      you appears here.
    </EmptyState>
  ) : (
    <EmptyState icon="user" title="No characters yet">
      Your DM writes the characters and says who plays which. Ask them to put your name on one, and
      it shows up here.
    </EmptyState>
  );
}

export function MyCharactersScreen({ route }: { readonly route: Route }) {
  // `loadMyCharacters` is module-level and closes over nothing, so it is already
  // the stable identity `useApiResource` needs — no `useCallback` to key.
  const [resource, reload] = useApiResource(loadMyCharacters);
  const view = resource.state === "ready" ? resource.value : undefined;

  return (
    <AppShell
      route={route}
      topBar={
        <TopBar
          title="Your characters"
          subtitle={
            view === undefined ? undefined : rosterSummary(view.characters, view.tableCount)
          }
        />
      }
    >
      {resource.state === "loading" && <Loading label="Reading your characters…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined &&
        (view.characters.length === 0 ? (
          <NothingYet view={view} />
        ) : (
          // The encounter grid's rule: `auto-fill minmax(…)` inside a container
          // query, because the question is how wide *this column* is and the
          // Hob panel can take 400px of it without the window moving.
          <div className="grid grid-cols-1 items-stretch gap-gutter @2xl:grid-cols-2 @5xl:grid-cols-3">
            {view.characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                campaignName={view.campaignNames.get(character.campaignId)}
              />
            ))}
          </div>
        ))}
    </AppShell>
  );
}
