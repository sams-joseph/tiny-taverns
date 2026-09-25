import type { Character, PartySeat, SeatPrep } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Card, cardLinkClassName, Icon, SectionHeading } from "@taverns/ui";
import { DateTime, Result } from "effect";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { hitPoints, hpBand, hpFraction } from "../characters/sheet";
import { HpBar } from "../characters/SheetParts";
import { newRequestId } from "../run/state";
import { SaveFailure } from "../ui/form";
import { hpAfter, pressed, type SeatCard as SeatCardModel } from "./cards";
import { InspirationToggle } from "./InspirationToggle";

/**
 * One seat on the Party tab, as the redesign draws the card: the portrait band,
 * who the character is and who plays them, their hit points with − and +, the
 * tiles a DM asks for across the table, their conditions, and under a hairline
 * the DM's own hook and secret for the seat (`SeatPrep`, which only the
 * creator's read carries), each drawn only when written.
 *
 * **The whole card opens the seat's page** (`SeatScreen.tsx`), where the seat
 * is managed and the sheet is read. The name is the one link, its `::after`
 * stretched over the card; − and +, and inspiration's toggle, are buttons,
 * which `<Card linked>` lifts above that overlay, so a press changes the number
 * or the award and navigates nowhere. They are the in-play verbs and stay on
 * the card; everything that manages the
 * seat (sharing it, temporary hit points, conditions, retiring) is on its page.
 *
 * **The rows line up across the grid.** A card is `grid-rows-subgrid` over
 * `CARD_ROWS` of the grid's rows, so a lineage that wraps to two lines, or a
 * card with no tiles, moves every card in its row down together rather than
 * leaving its hit points out of step with its neighbours'. Every card draws all
 * of its rows, empty where it has nothing to say, and an empty row takes no
 * space unless a neighbour's fills it.
 */

/**
 * How many of the grid's rows a card spans: the portrait, who they are, hit
 * points, the tiles, the badges and the prep — one per child of the card below.
 */
const CARD_ROWS = "row-span-6";

export function SeatCard({
  row,
  card,
  prep,
}: {
  readonly row: PartySeat;
  readonly card: SeatCardModel;
  /** The creator's notes for this seat; absent or both `null` draws no footer. */
  readonly prep: SeatPrep | undefined;
}) {
  const character = row.character;
  return (
    <Card
      linked
      data-slot="seat-card"
      className={`${CARD_ROWS} grid grid-rows-subgrid gap-y-0 overflow-hidden`}
    >
      <div className="relative h-party-portrait overflow-hidden border-b border-hairline bg-surface-sunken">
        {/* The monogram, with Hob's portrait over it once there is one. */}
        <CharacterPortrait name={card.name} portrait={character?.portrait ?? null} size="card" />
      </div>

      <div className="flex flex-wrap items-start gap-3 px-card pt-4">
        <div className="min-w-0 flex-1">
          <SectionHeading size="title">
            <Link
              to="/campaigns/$campaignId/party/$seatId"
              params={{ campaignId: row.seat.campaignId, seatId: row.seat.id }}
              data-card-link
              className={cardLinkClassName}
            >
              {card.name}
            </Link>
          </SectionHeading>
          {card.kind === "character" && card.lineage !== undefined && (
            <p className="mt-1 mb-0 text-body-s leading-snug text-muted-foreground">
              {card.lineage}
            </p>
          )}
          {card.kind === "deleted" && (
            // The snapshot outliving its character: the honest sentence, not a
            // vanished card.
            <p className="mt-1 mb-0 text-body-s leading-snug text-muted-foreground">
              Character deleted
            </p>
          )}
          {card.player !== undefined && (
            <p className="mt-0.5 mb-0 text-caption leading-snug text-faint">
              Played by {card.player}
            </p>
          )}
        </div>
        {character !== null && card.kind === "character" && (
          // Top right, as drawn: an in-play verb, so it stays on the card,
          // lifted above the link like − and +.
          <InspirationToggle row={row} character={character} name={card.name} />
        )}
      </div>

      <div className="px-card pt-4">
        {character !== null && card.kind === "character" && card.hp !== undefined && (
          <HitPoints row={row} character={character} name={card.name} />
        )}
      </div>

      <div className="px-card pt-4">
        {card.kind === "character" && card.stats.length > 0 && (
          // Four columns whatever the sheet answers, so a tile stays a quarter
          // of the card wide rather than stretching into a headline.
          <dl className="m-0 grid grid-cols-4 gap-1.5">
            {card.stats.map((stat) => (
              <div
                key={stat.key}
                className="flex min-w-0 flex-col-reverse items-center gap-1 rounded-md border border-hairline bg-surface-sunken px-1 py-2"
              >
                <dt className="truncate text-caption leading-none text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="m-0 max-w-full truncate font-mono text-mono-l leading-none text-heading">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="px-card pt-3.5">
        {card.kind === "character" &&
          (card.conditions.length > 0 || card.tempHp > 0 || card.inspiration) && (
            // One variant for every condition: the words are the DM's own and
            // nothing in the product branches on them, so none is drawn as more
            // alarming than another. Inspiration is the owner's sheet's outline
            // badge, never the peach fill a primary wears.
            <ul aria-label="Conditions" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {card.conditions.map((condition) => (
                <li key={condition}>
                  <Badge variant="secondary">{condition}</Badge>
                </li>
              ))}
              {card.inspiration && (
                <li>
                  <Badge variant="outline">
                    <Icon name="sparkles" size={11} />
                    Inspired
                  </Badge>
                </li>
              )}
              {card.tempHp > 0 && (
                <li>
                  <Badge variant="info">+{card.tempHp} temp</Badge>
                </li>
              )}
            </ul>
          )}
      </div>

      <div className="pb-card">
        {prep !== undefined && (prep.hook !== null || prep.secret !== null) && (
          <SeatNotes hook={prep.hook} secret={prep.secret} />
        )}
      </div>
    </Card>
  );
}

/**
 * The foot of the card: what pulls the character into the story, and what the
 * DM knows that the table does not. The secret is in magic ink behind an
 * eye-off, the product's mark for *only you see this* — the whole page is the
 * creator's, but the card is what a DM might turn towards the table.
 */
function SeatNotes({
  hook,
  secret,
}: {
  readonly hook: string | null;
  readonly secret: string | null;
}) {
  return (
    <div className="mt-3.5 flex flex-col gap-2.5 border-t border-hairline px-card pt-3.5">
      {hook !== null && (
        <p className="m-0 flex gap-2 text-body-s leading-body text-foreground">
          <Icon name="map" size={14} className="mt-0.5 shrink-0 text-faint" />
          <span className="sr-only">Hook: </span>
          <span className="min-w-0 text-pretty break-words">{hook}</span>
        </p>
      )}
      {secret !== null && (
        <p className="m-0 flex gap-2 text-body-s leading-body text-magic-ink">
          <Icon name="eye-off" size={14} className="mt-0.5 shrink-0" />
          <span className="sr-only">Secret: </span>
          <span className="min-w-0 text-pretty break-words">{secret}</span>
        </p>
      )}
    </div>
  );
}

/**
 * How long the card waits after the last press before it writes: long enough
 * that a run of presses is one request, short enough that the DM has not moved
 * on by the time it lands.
 */
const PAUSE_MS = 600;

/** The later of two answers about one character, by the row's own clock. */
const newer = (a: Character, b: Character | undefined): Character =>
  b !== undefined && DateTime.toEpochMillis(b.updatedAt) > DateTime.toEpochMillis(a.updatedAt)
    ? b
    : a;

/**
 * The hit points and their − and +, batched.
 *
 * A press moves the number at once and adds one to what the card owes the
 * server; when the presses pause, the whole of it goes as **one** `party.damage`
 * with one `requestId`, so twelve presses are one request and one re-read.
 * That matters beyond tidiness: the encounters list answers `reads.party` too
 * (its difficulty counts the party), so every write re-reads it as well.
 *
 * What the card shows is `hpAfter` over the newest answer it has — the frame's
 * re-read or the write's own reply, whichever the server stamped later — with
 * everything still owed applied, which is the number the server will produce.
 * Presses made while a write is out wait for it, then go as the next one. A
 * refused write is dropped and said, and the number returns to the server's.
 * Leaving the page mid-run still sends what was pressed.
 */
function HitPoints({
  row,
  character,
  name,
}: {
  readonly row: PartySeat;
  readonly character: Character;
  readonly name: string;
}) {
  const { failure, submit } = useMutation();
  const campaignId = row.seat.campaignId;
  const seatId = row.seat.id;
  /** The write's own reply, until the frame's re-read catches up with it. */
  const [reply, setReply] = useState<Character | undefined>();
  const base = newer(character, reply);

  // The presses are counted in refs because the timer and the reply read them
  // after the render that set them; `redraw` is how a change reaches the page.
  const owed = useRef(0);
  const sending = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [, redraw] = useReducer((tick: number) => tick + 1, 0);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (owed.current === 0 || sending.current !== 0) return;
    const amount = owed.current;
    owed.current = 0;
    sending.current = amount;
    redraw();
    const done = await submit(
      (client) =>
        client.party.damage({
          params: { campaignId, campaignCharacterId: seatId },
          // Positive damages, negative heals — `CharacterDamage`'s one clamp.
          payload: { amount, requestId: newRequestId() },
        }),
      // The creator's own seated character is on their *My characters* too.
      [reads.party(campaignId), reads.myCharacters],
    );
    sending.current = 0;
    if (Result.isSuccess(done)) setReply(done.success);
    redraw();
    // Presses made while this was out, whose pause has already passed.
    if (owed.current !== 0 && timer.current === undefined) void flush();
  }, [submit, campaignId, seatId]);

  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  const press = (direction: "damage" | "heal") => {
    const outstanding = pressed(base, sending.current + owed.current, direction);
    owed.current = outstanding - sending.current;
    redraw();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), PAUSE_MS);
  };

  // Nothing owed leaves the server's own words, a null current included: that
  // is *nobody has said*, which the card draws as the max alone.
  const moved = sending.current + owed.current;
  const current = moved === 0 ? base.hpCurrent : hpAfter(base, moved);
  const words = hitPoints(current, base.hpMax);
  const fraction = hpFraction(current, base.hpMax);
  const now = current ?? base.hpMax ?? 0;

  return (
    <section aria-label={`${name}'s hit points`} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon
          name="heart-pulse"
          size={14}
          className={
            fraction === undefined
              ? "text-faint"
              : hpBand(fraction) === "low" || hpBand(fraction) === "down"
                ? "text-danger-ink"
                : "text-muted-foreground"
          }
        />
        <span className="font-mono text-mono-l leading-none text-heading">{words}</span>
        <span className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Damage ${name}`}
            title="Damage 1"
            disabled={now === 0}
            onClick={() => press("damage")}
          >
            <Icon name="minus" size={14} className="text-danger-ink" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Heal ${name}`}
            title="Heal 1"
            disabled={base.hpMax !== null && now >= base.hpMax}
            onClick={() => press("heal")}
          >
            <Icon name="plus" size={14} className="text-success-ink" />
          </Button>
        </span>
      </div>
      {fraction !== undefined && <HpBar fraction={fraction} />}
      {failure !== undefined && <SaveFailure failure={failure} />}
    </section>
  );
}
