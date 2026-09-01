import type { Character } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Button, Card, CardContent, Icon } from "@taverns/ui";
import { useApiAtom } from "../api/atoms";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { tablesForNewCharacter } from "./create";
import { myCharactersAtom, type MyCharactersView } from "./load";
import { NewCharacterAction } from "./NewCharacterAction";
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
 * - ***Send to the DM*** and **the portrait upload**. Neither has anything
 *   behind it: there is no approval queue and no column for one — the delivery's
 *   own open questions say so — and there is no asset store, so the card draws
 *   initials.
 *
 * ### *New character* is here now, and this is what changed
 *
 * It used to be in the list above, on the reasoning that *a player cannot write
 * anything*. **Half of that went when `ownRowWritable` shipped** and the rest
 * went with `POST /me/campaigns/:c/characters`: a player at a shared table
 * writes their own row now, and this is the screen they start from.
 *
 * What did not change is who owns what. A character created here is the
 * creator's — `account_id` is `CurrentActor`'s, server-side, and there is
 * nowhere on `CharacterOwnCreate` to name an account — and it is `dm` by column
 * default, so their DM sees it and the rest of the table does not.
 * `campaign/CharacterDialog.tsx` is unchanged and is still how a DM types up
 * somebody else's, with `CharacterAssign` to hand it over.
 *
 * The button is `NewCharacterAction`, which is *step one of the flow* rather
 * than a control on the form — the captain's reordering puts finding a table
 * first, and it folds the memberships this screen already read rather than
 * asking for them again.
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
          render={<Link to="/characters/$characterId" params={{ characterId: character.id }} />}
        >
          Open sheet
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Three silences, told apart — and none of them papered over.
 *
 * An empty roster is exactly what it says: this account owns no character row.
 * *Why* is a question about the memberships `load.ts` already read, and it has
 * three answers rather than the two it had before a player could write one:
 *
 * - **no table at all** — the way in is an invitation, and it is somebody
 *   else's to send;
 * - **tables, but none you play at** — a DM who pressed *Player*. A character of
 *   your own goes at a table you sit at; the one you run is
 *   `campaign/CharacterDialog.tsx`'s. This branch exists so the copy never
 *   offers a control `NewCharacterAction` has decided not to draw, which is the
 *   failure a plain `memberships.length` check makes;
 * - **a table you play at** — write one, or wait for your DM.
 *
 * The last sentence is what changed. It used to read *"your DM writes the
 * characters and says who plays which"*, which was true of every release until
 * this one and is now half the answer.
 */
function NothingYet({ view }: { readonly view: MyCharactersView }) {
  if (view.memberships.length === 0) {
    return (
      <EmptyState icon="user" title="No characters yet">
        Nobody has invited you to a table. Follow the link your DM sends you, and whatever they hand
        you appears here.
      </EmptyState>
    );
  }

  if (tablesForNewCharacter(view.memberships).length === 0) {
    return (
      <EmptyState icon="user" title="No characters yet">
        You run the tables you are at, and a character of your own belongs at one you play at.
        Follow the link another DM sends you and it appears here.
      </EmptyState>
    );
  }

  return (
    <EmptyState icon="user" title="No characters yet">
      Write one down for a table you sit at, or wait for your DM to hand you one of theirs. Either
      way it appears here.
    </EmptyState>
  );
}

export function MyCharactersScreen() {
  const [resource, reload] = useApiAtom(myCharactersAtom);
  const view = resource.state === "ready" ? resource.value : undefined;

  return (
    <AppShell
      topBar={
        <TopBar
          title="Your characters"
          subtitle={
            view === undefined
              ? undefined
              : rosterSummary(view.characters, view.memberships.length, view.accountName)
          }
        >
          {view !== undefined && <NewCharacterAction memberships={view.memberships} />}
        </TopBar>
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
