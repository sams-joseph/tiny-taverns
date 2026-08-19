import type { CampaignId, Character, Encounter } from "@taverns/api";
import { Link, useParams } from "@tanstack/react-router";
import { Button, Card, CardContent, CardHeader, CardTitle, Icon, type IconName } from "@taverns/ui";
import { useState, type ReactNode } from "react";
import { EmptyState } from "../ui/states";
import {
  CampaignChrome,
  CampaignSettingsButtons,
  type CampaignAct,
  type CampaignChromeSlots,
} from "./CampaignChrome";
import { CharacterDialog } from "./CharacterDialog";
import { EncounterCard } from "./EncounterCard";
import { EncounterDialog } from "./EncounterDialog";
import type { CampaignView } from "./load";
import { PrepChecklist } from "./PrepChecklist";
import { SessionCard } from "./SessionCard";

/**
 * The campaign's home — `ui_kits/dm-screen/CampaignScreens.jsx`'s `CampOverview`,
 * against the real API.
 *
 * Everything on it answers one question the delivery states out loud: *where
 * were we and what happens when we sit down*. That is a different screen from
 * the encounter list it used to be a tab of, which is why the sixth delivery
 * gave it its own name and this one its own route.
 *
 * ### What the drawing asks for that the data does not have
 *
 * The rule is the oldest one this project has about deliveries — **do not render
 * a field the API does not have**, because a stubbed value is a worse lie than
 * an absent line. Four things on the drawn Overview have no read behind them and
 * are left out rather than invented:
 *
 * - **The session's date** (*"Session 13 — Saturday, 22 August"*). A `session`
 *   has `startedAt` and `endedAt`, which are when it *ran*; there is no
 *   scheduled date on the table and no screen anywhere that sets one.
 * - **The blurb under it** (*"Picking up on the east bank road…"*). Nothing on
 *   `Session` carries prose. `title` is the nearest thing and is drawn as the
 *   heading where it exists.
 * - **"4 of 6 seats filled"**. Settled: *there is no seat* — a `campaign_member`
 *   row cannot exist before an account, so a denominator would be a number
 *   nothing can produce. The honest count is how many characters the table has,
 *   which is what is drawn.
 * - **"Last time", as a prose summary of the previous night.** A recap is
 *   assembled per read and **nothing stores a summary** — that is the whole
 *   design of the feature, so a card promising one here would need a model call
 *   in a read path the captain has ruled out. The Chronicle is one press away
 *   and reads the real record; the link is drawn, the invented prose is not.
 *
 * Everything else is `CampaignView`, which the frame already loads — so the
 * Overview costs no read the campaign screen did not already make.
 */

/** The delivery's `SectionHead`: a heading, and the way to the whole of it. */
function SectionHead({
  title,
  children,
}: {
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2.5">
      <h2 className="font-display text-body leading-tight font-semibold tracking-display text-heading">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** The delivery's section link — accent-coloured, quiet, and a real `<a>`. */
const sectionLink = "text-caption leading-none font-medium text-accent-ink hover:text-link-hover";

/**
 * The night ahead, and the press that starts it.
 *
 * Drawn with the accent border the delivery gives it, because it is the one
 * card on the page that is about *now* rather than about the campaign's
 * contents. With no session it says so and offers the button that opens one
 * (`StartSessionDialog`); with one open and nothing on the table it offers the
 * fight instead.
 *
 * **The button is `slots.act` rather than a branch of its own.** The campaign
 * row draws the same press, and two controls computing the same three-way
 * question independently is two controls that can differ — see `CampaignAct`.
 */
function NextSession({ view, act }: { readonly view: CampaignView; readonly act: CampaignAct }) {
  const live = view.run;
  const encounters = view.encounters.length;
  // The unticked half of tonight's checklist — the same substitution the
  // Chronicle's aside makes, and for the same reason: it is what `Recap.ts`
  // already names as what the next night inherits.
  const open = view.prep.filter((item) => !item.done).length;

  const stats: ReadonlyArray<readonly [IconName, string, string]> = [
    [
      "swords",
      live?.encounterName ?? view.encounters[0]?.name ?? "Nothing built yet",
      live === undefined ? "First encounter" : "On the table now",
    ],
    [
      "users",
      `${String(view.party.length)} ${view.party.length === 1 ? "character" : "characters"}`,
      "Party",
    ],
    ...(view.session === undefined
      ? []
      : ([
          [
            "list-checks",
            `${String(open)} still to do`,
            open === 0 ? "Prep is done" : "Before you sit down",
          ],
        ] as const)),
  ];

  return (
    <Card className="border-accent">
      <CardHeader>
        <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 text-micro leading-none font-semibold tracking-wide-caps uppercase text-accent-ink">
              {view.session === undefined ? "No session open" : "Tonight"}
            </div>
            <CardTitle className="font-display text-display-s leading-tight font-semibold">
              {view.session === undefined
                ? "Nothing is running yet"
                : (view.session.title ?? `Session ${String(view.session.number)}`)}
            </CardTitle>
          </div>
          <Button className="shrink-0" onClick={act.press}>
            <Icon name={act.icon} size={14} />
            {act.label}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1">
          {stats.map(([icon, value, label]) => (
            <div key={label} className="flex items-center gap-2.5">
              <Icon name={icon} size={15} className="shrink-0 text-faint" aria-hidden="true" />
              <span>
                <span className="block text-body-s leading-snug font-medium text-foreground">
                  {value}
                </span>
                <span className="block text-micro leading-snug text-faint">{label}</span>
              </span>
            </div>
          ))}
          {encounters === 0 && (
            <span className="text-body-s leading-snug text-faint">
              Nothing is waiting for the party yet.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Who is running what, with the way to the roster that authors it.
 *
 * The delivery's `PartyStrip`. It draws characters and, beneath them, how many
 * people at the table have none — which is a real read here
 * (`campaign.playerCount` against the characters that name an account) rather
 * than the fixture's seat arithmetic.
 */
function PartyStrip({
  party,
  playerCount,
  campaignId,
}: {
  readonly party: ReadonlyArray<Character>;
  readonly playerCount: number;
  readonly campaignId: CampaignId;
}) {
  const held = new Set(
    party
      .map((character) => character.accountId)
      .filter((id): id is NonNullable<typeof id> => id !== null),
  );
  const without = Math.max(0, playerCount - held.size);

  return (
    <Card tone="sunken">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2.5">
          <CardTitle>The party</CardTitle>
          <Link to="/campaigns/$campaignId/party" params={{ campaignId }} className={sectionLink}>
            Manage party
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {party.length === 0 ? (
          <p className="text-body-s leading-body text-muted-foreground">
            Nobody has a character yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {party.map((character) => (
              <div key={character.id} className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-body-s leading-snug font-medium text-foreground">
                  {character.name}
                </span>
                {character.playerName !== null && (
                  <span className="shrink-0 text-micro leading-snug whitespace-nowrap text-faint">
                    {character.playerName}
                  </span>
                )}
              </div>
            ))}
            {without > 0 && (
              <p className="pt-0.5 text-caption leading-snug text-faint">
                {without} {without === 1 ? "player has" : "players have"} no character
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The party count moved here when the rail did, and stayed when the bar split:
 * the campaign row carries the name and the session badge, so the one fact
 * neither of them holds joins the line that already says which night and whose
 * party.
 */
const subtitleFor = (view: CampaignView): string | undefined => {
  const parts = [
    view.session === undefined ? undefined : `Session ${String(view.session.number)}`,
    view.campaign.partyName ?? undefined,
    `${String(view.campaign.playerCount)} ${view.campaign.playerCount === 1 ? "player" : "players"}`,
  ].filter((part): part is string => part !== undefined && part !== "");
  return parts.length === 0 ? undefined : parts.join(" · ");
};

/** The one dialog slot the Overview raises for itself. */
type Editing =
  | { readonly what: "encounter"; readonly encounter: Encounter | undefined }
  | { readonly what: "character"; readonly character: Character | undefined };

function Overview({ slots }: { readonly slots: CampaignChromeSlots }) {
  const { view, run, act, finishSession } = slots;
  const [editing, setEditing] = useState<Editing | undefined>();

  // Counted over every note, as the encounter list does: a card's count is a
  // fact about the encounter, not about what is on screen beside it.
  const noteCounts = new Map<string, number>();
  for (const note of view.notes) {
    if (note.attachedTo !== null) {
      noteCounts.set(note.attachedTo.id, (noteCounts.get(note.attachedTo.id) ?? 0) + 1);
    }
  }

  // The delivery draws every encounter under "on deck"; the whole list has its
  // own screen now, so this is the first few and a way to the rest.
  const onDeck = view.encounters.slice(0, 6);

  return (
    <>
      {/* `@4xl` (56rem = 896px) is the *content column's* width, not the
          viewport's — `main` is the container. 896 is where the aside earns its
          place: 340 for it, 32 for the gap, and 524 left for the body. */}
      <div className="flex flex-col gap-8 @4xl:flex-row @4xl:items-start">
        <div className="@container flex min-w-0 flex-1 flex-col gap-6">
          <NextSession view={view} act={act} />

          <div>
            <SectionHead title="Encounters on deck">
              <Link
                to="/campaigns/$campaignId/encounters"
                params={{ campaignId: view.campaign.id }}
                className={sectionLink}
              >
                All encounters
              </Link>
            </SectionHead>
            {view.encounters.length === 0 ? (
              <EmptyState icon="swords" title="No encounters yet">
                Nothing is waiting for the party. Write one with{" "}
                <span className="text-heading">New encounter</span> and it lands here, ready to run.
              </EmptyState>
            ) : (
              // `@lg` (32rem) and `@3xl` (48rem) are the *column's* widths, and
              // they are where the prototype's `auto-fill minmax(250px, 1fr)`
              // turns over: two cards need 516px, three need 782px.
              <div className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
                {onDeck.map((encounter) => (
                  <EncounterCard
                    key={encounter.id}
                    encounter={encounter}
                    noteCount={noteCounts.get(encounter.id) ?? 0}
                    running={view.run?.encounterId === encounter.id}
                    onEdit={() => setEditing({ what: "encounter", encounter })}
                    onRun={() => run(encounter.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-4 @4xl:w-aside @4xl:shrink-0">
          <PrepChecklist
            key={view.session?.id ?? view.campaign.id}
            campaignId={view.campaign.id}
            sessionId={view.session?.id}
            items={view.prep}
          />
          {view.session !== undefined && (
            <SessionCard session={view.session} liveRun={view.run} onFinish={finishSession} />
          )}
          <PartyStrip
            party={view.party}
            playerCount={view.campaign.playerCount}
            campaignId={view.campaign.id}
          />
        </aside>
      </div>

      {/* Keyed on what is being edited, so opening the dialog on a second row
          builds a fresh form rather than showing the first row's fields. */}
      {editing?.what === "encounter" && (
        <EncounterDialog
          key={editing.encounter?.id ?? "new-encounter"}
          campaignId={view.campaign.id}
          encounter={editing.encounter}
          onClose={() => setEditing(undefined)}
          onSaved={() => setEditing(undefined)}
        />
      )}
      {editing?.what === "character" && (
        <CharacterDialog
          key={editing.character?.id ?? "new-character"}
          campaignId={view.campaign.id}
          character={editing.character}
          onClose={() => setEditing(undefined)}
          onSaved={() => setEditing(undefined)}
        />
      )}
    </>
  );
}

export function CampaignScreen() {
  const { campaignId } = useParams({ from: "/campaigns/$campaignId" });

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Overview"
      subtitle={({ view }) => subtitleFor(view)}
      actions={(slots) => <CampaignSettingsButtons view={slots.view} onOpen={slots.openSettings} />}
    >
      {(slots) => <Overview slots={slots} />}
    </CampaignChrome>
  );
}
