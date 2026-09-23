import type { CampaignId, OwnedCharacter } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  Button,
  Card,
  CardContent,
  cardLinkClassName,
  Icon,
  sectionHeadingVariants,
  EmptyState,
  Loading,
} from "@taverns/ui";
import { useState } from "react";
import { useApiAtom } from "../api/atoms";
import { TopBar } from "../shell/TopBar";
import { AddToCampaignDialog } from "./AddToCampaignDialog";
import { CharacterPortrait } from "./CharacterPortrait";
import { useHobDrawingPolling } from "../hob/drawingPolling";
import { campaignsAvailableToJoin } from "./join";
import { myCharactersAtom, type MyCharactersView } from "./load";
import { NewCharacterAction } from "./NewCharacterAction";
import {
  hitPoints,
  hpFraction,
  initiativeOf,
  lineageLine,
  passivePerceptionOf,
  rosterSummary,
} from "./sheet";
import { HpBar } from "./SheetParts";
import { ApiFailureNotice } from "../api/ApiFailureNotice";

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
 * - **A generic "Join a game" code box.** A character is account-owned and
 *   top-level since the continuity decision, so *"Not seated at a table"* is
 *   an ordinary state this screen draws — and taking one to a campaign is a
 *   seat (`party.join`, `campaign_character`), not a copy. The explicit
 *   *Add to campaign* action below is that verb; it uses existing memberships,
 *   not an invitation-code flow.
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
 * nowhere on `CharacterOwnCreate` to name an account — and it has **no seat**
 * until the owner explicitly adds it to a campaign. There is no DM-typed
 * character any more: the continuity decision of 2026-09-01 made every
 * character its player's own, and the dialog a DM used to type one up in went
 * with it.
 *
 * The button is `NewCharacterAction`, which is *step one of the flow* rather
 * than a control on the form — the captain's reordering puts finding a table
 * first, and it folds the memberships this screen already read rather than
 * asking for them again.
 *
 * A *Playing* badge goes too: seating is now a list of campaign names on the
 * card, and an unseated character says so in the same place rather than wearing
 * a badge for a state that changes per campaign.
 */

/**
 * One character, as the captain's card drawing lays it out: a lettered plate on
 * the sunken surface with the level pinned in its corner, then the name, the
 * lineage, the hit-point bar, the three numbers a table asks for across the
 * screen (AC, initiative, passive Perception), and a line for conditions and
 * who plays them.
 *
 * Every element is a field the row holds or a sum the sheet already makes, and
 * each is drawn only when that answer exists — `level`, `ac` and `hpMax` are
 * nullable and a fresh sheet has no ability cells, so a card can lose any of
 * them and must not draw a zero in their place. The drawing's **colour swatch**
 * is left out: nothing on the row or the account carries a colour.
 *
 * Below the drawing's footer, the thing the roster did before and the drawing
 * does not show: where the character is seated, with *Add to campaign* on a
 * hairline-divided row of its own.
 *
 * The whole card opens the sheet. The link is the character's name, its
 * `::after` stretched over the card, so there is one link and no interactive
 * element nested inside another. *Add to campaign* is `relative` and comes
 * after the name in the tree, so it paints above that overlay with no z-index
 * of its own and presses without navigating.
 */
function CharacterCard({
  owned,
  campaignNames,
  memberships,
}: {
  readonly owned: OwnedCharacter;
  readonly campaignNames: ReadonlyMap<CampaignId, string>;
  readonly memberships: MyCharactersView["memberships"];
}) {
  const character = owned.character;
  const hp = hitPoints(character.hpCurrent, character.hpMax);
  const fraction = hpFraction(character.hpCurrent, character.hpMax);
  const lineage = lineageLine(character);
  const player =
    character.playerName !== null && character.playerName.trim() !== ""
      ? character.playerName
      : undefined;
  const [joining, setJoining] = useState(false);
  const joinOptions = campaignsAvailableToJoin(owned, memberships);
  // The tables this character is seated at, named. A seat whose campaign the
  // membership read cannot name (a table this account has since left the
  // group of) gets the honest fallback rather than a blank.
  const tables = owned.seats.map(
    (seat) => campaignNames.get(seat.campaignId) ?? "A table you have left",
  );
  // The three numbers, each only when there is an answer. A card with one keeps
  // it a third of the box wide rather than stretching it into a headline.
  const initiative = initiativeOf(character.sheet);
  const passive = passivePerceptionOf(character.sheet);
  const stats = [
    { label: "AC", value: character.ac ?? undefined },
    { label: "Init", value: initiative },
    { label: "Passive", value: passive },
  ].flatMap((stat) => (stat.value === undefined ? [] : [{ ...stat, value: stat.value }]));

  return (
    <Card linked className="h-full overflow-hidden">
      <div className="relative aspect-4/3 overflow-hidden border-b border-hairline bg-surface-sunken">
        {/* The monogram, with Hob's portrait over it once there is one. */}
        <CharacterPortrait name={character.name} portrait={character.portrait} size="card" />
        {character.level !== null && (
          <Badge variant="secondary" className="absolute top-3 left-3">
            Level {character.level}
          </Badge>
        )}
        {character.portraitPending && (
          <Badge variant="outline" role="status" className="absolute bottom-3 left-3">
            Hob is drawing…
          </Badge>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-5 pt-card">
        <div className="min-w-0">
          <p className={sectionHeadingVariants({ size: "display" })}>
            <Link
              to="/characters/$characterId"
              params={{ characterId: character.id }}
              data-card-link
              className={cardLinkClassName}
            >
              {character.name}
            </Link>
          </p>
          {lineage !== undefined && (
            <p className="mt-1 text-body leading-body text-muted-foreground">{lineage}</p>
          )}
        </div>

        {hp !== undefined && (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body-s leading-snug text-muted-foreground">Hit points</span>
              <span className="font-mono text-mono-l leading-snug text-heading">{hp}</span>
            </div>
            {fraction !== undefined && <HpBar fraction={fraction} />}
          </div>
        )}

        {stats.length > 0 && (
          <dl className="grid grid-cols-3 divide-x divide-hairline rounded-md border border-hairline bg-surface-sunken">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse items-center gap-1 py-2.5">
                <dt className="text-body-s leading-none text-muted-foreground">{stat.label}</dt>
                <dd className="font-mono text-mono-l leading-none text-heading">{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-auto flex items-baseline justify-between gap-3 text-body-s leading-body">
          <span
            className={
              character.conditions.length === 0
                ? "min-w-0 text-muted-foreground"
                : "min-w-0 text-foreground"
            }
          >
            {character.conditions.length === 0 ? "No conditions" : character.conditions.join(", ")}
          </span>
          {player !== undefined && <span className="shrink-0 text-muted-foreground">{player}</span>}
        </div>
      </CardContent>

      <div className="flex flex-col gap-3 border-t border-hairline px-card py-3">
        <div className="flex items-center gap-2">
          <Icon name="book-open" size={14} className="shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1 truncate text-caption leading-body text-foreground">
            {/* The seats, named. A character between tables is a real state now
                — it outlives every seat — and the line says so rather than
                inventing a campaign. Several seats read as a list, which is
                the continuity decision on one line. */}
            {tables.length === 0 ? "Not seated at a table" : tables.join(" · ")}
          </span>
        </div>
        {joinOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setJoining(true)}>
              <Icon name="user-plus" size={14} />
              Add to campaign
            </Button>
          </div>
        )}
      </div>
      {joining && (
        <AddToCampaignDialog
          owned={owned}
          memberships={memberships}
          onClose={() => setJoining(false)}
        />
      )}
    </Card>
  );
}

/**
 * Two silences, told apart — and neither papered over.
 *
 * An empty roster is exactly what it says: this account owns no character row.
 * *Why* is a question about the memberships `load.ts` already read. There used
 * to be a third branch — *tables, but none you play at*, for a DM whose only
 * memberships were their own — and it went with the continuity decision of
 * 2026-09-01: a creator is a player too now, so any table at all is somewhere a
 * character of your own can go, and `tablesForNewCharacter` never answers empty
 * while a membership exists.
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

  return (
    <EmptyState icon="user" title="No characters yet">
      Write one down using any table&rsquo;s rules — the ones you run included. It appears here
      first; add it to a campaign when you are ready.
    </EmptyState>
  );
}

export function MyCharactersScreen() {
  const [resource, reload] = useApiAtom(myCharactersAtom);
  const view = resource.state === "ready" ? resource.value : undefined;
  // While Hob draws any of them, re-read until the portraits land.
  useHobDrawingPolling(
    view?.characters.some((owned) => owned.character.portraitPending) === true,
    reload,
  );

  return (
    <>
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
      {resource.state === "loading" && <Loading label="Reading your characters…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined &&
        (view.characters.length === 0 ? (
          <NothingYet view={view} />
        ) : (
          // The encounter grid's rule: `auto-fill minmax(…)` inside a container
          // query, because the question is how wide *this column* is and the
          // Hob panel can take 400px of it without the window moving.
          <div className="grid grid-cols-1 items-stretch gap-gutter @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4">
            {view.characters.map((owned) => (
              <CharacterCard
                key={owned.character.id}
                owned={owned}
                campaignNames={view.campaignNames}
                memberships={view.memberships}
              />
            ))}
          </div>
        ))}
    </>
  );
}
