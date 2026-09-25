import type { CampaignMember, Character, PartySeat } from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  BackLink,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Icon,
  Input,
  Label,
  SectionHeading,
} from "@taverns/ui";
import { Result } from "effect";
import { useState, type FormEvent } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { membersAtom } from "../campaign/load";
import { CharacterPortrait } from "../characters/CharacterPortrait";
import { drawnSections } from "../characters/sheet";
import { SheetDocument } from "../characters/SheetDocument";
import { HpTrack, StatPill } from "../characters/SheetParts";
import { newRequestId } from "../run/state";
import { ActionsMenu } from "../ui/ActionsMenu";
import { SaveFailure, VisibilityField } from "../ui/form";
import { seatCard, type SeatCard } from "./cards";
import { RetireSeatDialog } from "./RetireSeatDialog";

/**
 * One seat at the table, the creator's — where a seat is managed and the
 * character behind it is read.
 *
 * A creator could not open another account's character anywhere before this:
 * the sheet route reads `GET /me/characters`, which answers owned characters
 * only. This page needs no read of its own for the character, because
 * `party.list` already carries the whole shared `Character` (sheet included),
 * and the frame reads it for every campaign destination.
 *
 * ### Creator-only through its read, not through the tab
 *
 * A player can read `party.list` — their own seat and every shared one — so a
 * page built on the frame alone would draw a player cards whose writes the
 * server refuses. `extra` is `members.list`, behind the `DmActor` gate, so a
 * player at this URL gets the ordinary `NotFound` and the frame says *Not
 * here*, as on the Party tab and the encounter builder. The members read also
 * answers the player's name when neither the seat nor the character carries
 * one (`seatCard`).
 *
 * ### What lives here and what does not
 *
 * The seat's settings: its hit points (a delta through `party.damage`), its
 * temporary hit points and conditions (`PartySeatUpdate`, written through to
 * the shared character), whether the table may see it, and retiring it. The
 * sheet under them is the owner's document drawn read-only — the same
 * `SheetDocument` the owner writes, with no `writes`, so nothing on it presses:
 * nobody writes another account's sheet. Gear lines draw by name alone, since
 * the equipment rows they point at are the owner's Library.
 */
export function SeatScreen() {
  const { campaignId, seatId } = useParams({
    from: "/_shell/campaigns/$campaignId/party/$seatId",
  });
  const navigate = useNavigate();
  /** Above the frame, like every screen's dialog: the header opens it, the body draws it. */
  const [retiring, setRetiring] = useState(false);
  const find = (party: ReadonlyArray<PartySeat>) => party.find((row) => row.seat.id === seatId);

  return (
    <CampaignChrome<ReadonlyArray<CampaignMember>>
      campaignId={campaignId}
      title="Party"
      extra={membersAtom(campaignId)}
      subtitle={({ view }) => {
        const row = find(view.party);
        return row === undefined ? undefined : (row.character?.name ?? row.seat.displayName);
      }}
      actions={({ view }) => (
        <>
          <BackLink render={<Link to="/campaigns/$campaignId/party" params={{ campaignId }} />}>
            Party
          </BackLink>
          {find(view.party) !== undefined && (
            // Retiring sits in the page's actions menu, as deleting an encounter
            // does on its page: a verb on the object the page is, behind a
            // confirmation, never a bare press.
            <ActionsMenu
              label="Seat actions"
              items={[
                {
                  label: "Retire seat",
                  icon: "user-round-x",
                  destructive: true,
                  onSelect: () => setRetiring(true),
                },
              ]}
            />
          )}
        </>
      )}
    >
      {({ view, extra }) => {
        const row = find(view.party);
        if (row === undefined) {
          // Retired, or never this table's: `party.list` answers live seats only.
          return (
            <EmptyState icon="users" title="No such seat">
              It is not among this table&rsquo;s seats any more.{" "}
              <Link
                to="/campaigns/$campaignId/party"
                params={{ campaignId }}
                className="text-link hover:text-link-hover"
              >
                Party
              </Link>
            </EmptyState>
          );
        }
        const member = extra.find((candidate) => candidate.accountId === row.seat.accountId);
        return (
          <>
            <SeatBody row={row} card={seatCard(row, member)} />
            {retiring && (
              <RetireSeatDialog
                row={row}
                onClose={() => setRetiring(false)}
                onRetired={() =>
                  void navigate({ to: "/campaigns/$campaignId/party", params: { campaignId } })
                }
              />
            )}
          </>
        );
      }}
    </CampaignChrome>
  );
}

/** The seat's sheet has no spine to scroll to its sections, so nothing registers. */
const ignoreSection = () => undefined;

function SeatBody({ row, card }: { readonly row: PartySeat; readonly card: SeatCard }) {
  const character = row.character;
  return (
    /* The settings beside the sheet where the column is wide enough, above it
       where it is not — `@4xl`, the step the Party tab docks its aside at. */
    <div className="flex flex-col gap-gutter @4xl:flex-row @4xl:items-start">
      <div className="flex min-w-0 flex-col gap-gutter @4xl:w-aside @4xl:shrink-0">
        {character === null || card.kind === "deleted" ? (
          <DeletedCharacter name={card.name} player={card.player} />
        ) : (
          <Vitals row={row} character={character} card={card} />
        )}
        <SeatSettings row={row} name={card.name} />
      </div>
      {character !== null && (
        <section aria-label={`${character.name}'s sheet`} className="min-w-0 flex-1">
          <SheetDocument
            character={character}
            gearRows={[]}
            sections={drawnSections(character.sheet, false)}
            register={ignoreSection}
            writes={undefined}
          />
        </section>
      )}
    </div>
  );
}

/** Who they are: the plate, the name, the lineage line and who plays them. */
function Identity({
  name,
  portrait,
  lineage,
  player,
}: {
  readonly name: string;
  readonly portrait: Character["portrait"];
  readonly lineage: string | undefined;
  readonly player: string | undefined;
}) {
  return (
    <div className="flex items-start gap-3">
      <CharacterPortrait name={name} portrait={portrait} size="lg" />
      <div className="min-w-0">
        <SectionHeading size="title">{name}</SectionHeading>
        {lineage !== undefined && (
          <p className="mb-0 text-body-s leading-body text-muted-foreground">{lineage}</p>
        )}
        {player !== undefined && (
          <p className="mb-0 text-body-s leading-body text-faint">Played by {player}</p>
        )}
      </div>
    </div>
  );
}

/** A seat whose character was deleted keeps standing with its snapshot: the seat is history. */
function DeletedCharacter({
  name,
  player,
}: {
  readonly name: string;
  readonly player: string | undefined;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-card">
        <Identity name={name} portrait={null} lineage={undefined} player={player} />
        <p className="mb-0 text-body-s leading-body text-muted-foreground">
          Character deleted. Its owner removed it, so there is no sheet to read; the seat keeps the
          name the table knew it by.
        </p>
      </CardContent>
    </Card>
  );
}

/** A whole number within the contract's bounds, or undefined. */
const wholeNumber = (raw: string, min: number, max: number): number | undefined => {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
};

/** `PartySeatUpdate.conditions`' bounds: one word of at most 40, at most 24 of them. */
const MAX_CONDITIONS = 24;
const MAX_CONDITION_LENGTH = 40;

/**
 * Where the character is right now, and the creator's hands on it.
 *
 * Every write here lands on the **shared** character, so it is what every table
 * seating them shows — and on the owner's own roster, which is why each names
 * `reads.myCharacters` beside the party (the creator's own seated character is
 * on their *My characters*). None is optimistic: each press waits for the
 * server and redraws from the re-read, and the controls are disabled while it
 * does, which is also what keeps a double press from landing twice.
 */
function Vitals({
  row,
  character,
  card,
}: {
  readonly row: PartySeat;
  readonly character: Character;
  readonly card: Extract<SeatCard, { readonly kind: "character" }>;
}) {
  const { busy, failure, submit } = useMutation();
  const campaignId = row.seat.campaignId;
  const params = { campaignId, campaignCharacterId: row.seat.id };
  const changed = [reads.party(campaignId), reads.myCharacters];

  // How many hit points a press moves: one by default, so − and + are the
  // drawing's nudge, and a number for the twelve a fireball takes.
  const [amount, setAmount] = useState("1");
  const step = wholeNumber(amount, 1, 10_000);
  const move = (direction: "damage" | "heal") => {
    if (step === undefined) return;
    void submit(
      (client) =>
        client.party.damage({
          params,
          // Positive damages, negative heals — `CharacterDamage`'s one clamp.
          payload: { amount: direction === "damage" ? step : -step, requestId: newRequestId() },
        }),
      changed,
    );
  };

  const [condition, setCondition] = useState("");
  const writeConditions = (conditions: ReadonlyArray<string>) =>
    submit((client) => client.party.update({ params, payload: { conditions } }), changed);
  const addCondition = async (event: FormEvent) => {
    event.preventDefault();
    const word = condition.trim();
    if (word === "" || character.conditions.includes(word)) {
      setCondition("");
      return;
    }
    const done = await writeConditions([...character.conditions, word]);
    if (Result.isSuccess(done)) setCondition("");
  };
  const full = character.conditions.length >= MAX_CONDITIONS;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-card">
        <Identity
          name={card.name}
          portrait={character.portrait}
          lineage={card.lineage}
          player={card.player}
        />

        <section aria-label="Hit points" className="flex flex-col gap-2">
          <HpTrack
            current={character.hpCurrent}
            max={character.hpMax}
            temp={character.tempHp}
            {...(character.sheet.identity?.hitDice === undefined
              ? {}
              : { hitDice: character.sheet.identity.hitDice })}
          />
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              aria-label={`Damage ${card.name}`}
              title="Damage"
              disabled={busy || step === undefined}
              onClick={() => move("damage")}
            >
              <Icon name="minus" size={14} />
            </Button>
            <Input
              mono
              id="seat-hp-amount"
              aria-label="Hit points to move"
              inputMode="numeric"
              className="w-16 text-center"
              value={amount}
              aria-invalid={step === undefined}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={`Heal ${card.name}`}
              title="Heal"
              disabled={busy || step === undefined}
              onClick={() => move("heal")}
            >
              <Icon name="plus" size={14} />
            </Button>
          </div>
        </section>

        {card.stats.length > 0 && (
          /* One row that the tiles share, however many the sheet answers. */
          <div className="flex gap-1.5">
            {card.stats.map((stat) => (
              <StatPill key={stat.key} label={stat.label} value={stat.value} />
            ))}
          </div>
        )}

        {/* Inspiration's toggle goes here, beside the vitals it sits with on
            the card — a later change wires `PartySeatUpdate.inspiration`. */}

        {/* Keyed on the value, so a draft never outlives the number it was
            typed over: damage spends temporary hit points first, and the
            field must show what the re-read says, not what was typed before. */}
        <TempHp
          key={character.tempHp}
          current={character.tempHp}
          busy={busy}
          onSet={(tempHp) =>
            void submit((client) => client.party.update({ params, payload: { tempHp } }), changed)
          }
        />

        <section aria-label="Conditions" className="flex flex-col gap-1.5">
          <Label htmlFor="seat-condition">Conditions</Label>
          {character.conditions.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {character.conditions.map((word) => (
                <li key={word}>
                  <Badge variant="secondary" className="gap-1 pr-0.5">
                    {word}
                    <button
                      type="button"
                      aria-label={`Remove ${word}`}
                      disabled={busy}
                      onClick={() =>
                        void writeConditions(character.conditions.filter((kept) => kept !== word))
                      }
                      className="flex size-4 items-center justify-center rounded-pill text-muted-foreground transition-control hover:text-foreground focus-visible:outline-none focus-visible:ring-focus disabled:opacity-50"
                    >
                      <Icon name="x" size={11} />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {/* The DM's own words — nothing in the product branches on them, so
              there is no list to pick from, only what to call it. */}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(event) => void addCondition(event)}
          >
            <Input
              id="seat-condition"
              placeholder={full ? "Twenty-four is the most" : "Poisoned"}
              maxLength={MAX_CONDITION_LENGTH}
              value={condition}
              disabled={full}
              onChange={(event) => setCondition(event.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={busy || full || condition.trim() === ""}
            >
              Add
            </Button>
          </form>
        </section>

        {failure !== undefined && <SaveFailure failure={failure} />}
      </CardContent>
    </Card>
  );
}

function TempHp({
  current,
  busy,
  onSet,
}: {
  readonly current: number;
  readonly busy: boolean;
  readonly onSet: (tempHp: number) => void;
}) {
  const [draft, setDraft] = useState(String(current));
  const value = wholeNumber(draft, 0, 10_000);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (value !== undefined && value !== current) onSet(value);
  };
  return (
    <form className="flex flex-col gap-1.5" onSubmit={save}>
      <Label htmlFor="seat-temp-hp">Temporary hit points</Label>
      <div className="flex items-center gap-1.5">
        <Input
          mono
          id="seat-temp-hp"
          inputMode="numeric"
          className="w-20"
          value={draft}
          aria-invalid={value === undefined}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={busy || value === undefined || value === current}
        >
          Set
        </Button>
      </div>
    </form>
  );
}

/**
 * The seat's own facts: whether the table may see it. The creator's prep
 * notes for this seat (its hook and its secret) join this card once they are
 * on the wire.
 */
function SeatSettings({ row, name }: { readonly row: PartySeat; readonly name: string }) {
  const { busy, failure, submit } = useMutation();
  const campaignId = row.seat.campaignId;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-card">
        <SectionHeading size="label">The seat</SectionHeading>
        <VisibilityField
          id="seat-visibility"
          value={row.seat.visibility}
          disabled={busy}
          onChange={(visibility) =>
            void submit(
              (client) =>
                client.party.update({
                  params: { campaignId, campaignCharacterId: row.seat.id },
                  payload: { visibility },
                }),
              [reads.party(campaignId)],
            )
          }
          shared={`Everyone at this table can see ${name} and read their sheet.`}
          hidden={`Only you and ${name}'s player can see them at this table.`}
        />
        {failure !== undefined && <SaveFailure failure={failure} />}
      </CardContent>
    </Card>
  );
}
