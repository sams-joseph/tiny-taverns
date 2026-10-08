import {
  initiativeFrom,
  type CampaignId,
  type EncounterRunId,
  type NpcId,
  type PlayerLiveCombatantYou,
  type PlayerNote,
  type PlayerNpc,
  type RollMode,
  type SessionId,
} from "@taverns/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Label,
  sectionHeadingVariants,
} from "@taverns/ui";
import { Result } from "effect";
import { Atom } from "effect/reactivity";
import { useEffect, useState } from "react";
import { ApiFailureNotice } from "../api/ApiFailureNotice";
import { apiAtom, useApiAtom } from "../api/atoms";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { useNpcSessionChat } from "../cast/playerChat";
import { RehearsalPanel } from "../cast/RehearsalPanel";
import { type LocalRoll, rollAbilityCheck, signed } from "../characters/rolls";
import { SaveFailure } from "../ui/form";
import type { TurnBanner } from "./turnBanner";

/**
 * The cards of a seated player's table that are not the fight's own parts:
 * whose turn it is, your initiative while it is rolled, the NPCs the DM has
 * opened at the table, and the read-alouds.
 */

const sessionNpcsAtom = Atom.family(
  ({ campaignId, sessionId }: { readonly campaignId: CampaignId; readonly sessionId: SessionId }) =>
    apiAtom(
      (client) => client.npcs.sessionList({ params: { campaignId, sessionId } }),
      [reads.sessionNpcs(sessionId)],
    ),
);

/**
 * Whose turn it is, at the head of the fight: the round, the creature that is
 * up — or *"Something moves"* — and the next one this player can see
 * (`turnBanner.ts`). A live region, so the turn moving is said aloud.
 */
export function TurnBannerCard({ banner }: { readonly banner: TurnBanner }) {
  return (
    <Card
      role="status"
      aria-label="Turn"
      className="flex-row flex-wrap items-center gap-x-5 gap-y-3 border-t-3 border-t-accent px-panel py-3.5"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-label-s leading-none text-muted-foreground">
          Round {String(banner.round)}
        </span>
        <span className={sectionHeadingVariants({ size: "title" })}>{banner.title}</span>
      </div>
      {banner.upNext !== undefined && (
        <div className="flex min-w-0 flex-col gap-1.5 border-l border-hairline pl-5">
          <span className="text-label-s leading-none text-muted-foreground">Up next</span>
          <span className="text-body leading-snug font-medium text-foreground">
            {banner.upNext}
          </span>
        </div>
      )}
    </Card>
  );
}

/**
 * Your own initiative, while the fight is rolling it: roll it here or type the
 * total you rolled with real dice, and it lands in your DM's list straight
 * away. Your DM can change it; once they have, their number stands and this
 * card only says what it is.
 */
export function YourInitiative({
  campaignId,
  runId,
  you,
  rollMode,
  onRolled,
}: {
  readonly campaignId: CampaignId;
  readonly runId: EncounterRunId;
  readonly you: PlayerLiveCombatantYou;
  readonly rollMode: RollMode;
  readonly onRolled: (roll: LocalRoll) => void;
}) {
  const { busy, failure, submit } = useMutation();
  const [draft, setDraft] = useState("");
  const typed = initiativeFrom(draft);

  const send = async (initiative: number) => {
    const sent = await submit(
      (client) =>
        client.table.setInitiative({
          params: { campaignId, runId, combatantId: you.combatantId },
          payload: { initiative },
        }),
      [reads.playerTable(campaignId)],
    );
    if (Result.isSuccess(sent)) setDraft("");
  };

  const roll = () => {
    if (you.initiativeBonus === null) return;
    const rolled = rollAbilityCheck("Initiative", signed(you.initiativeBonus), rollMode);
    if (rolled === undefined) return;
    onRolled(rolled);
    void send(rolled.total);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your initiative</CardTitle>
        <p className="text-body-s leading-body text-muted-foreground">
          {you.initiativeSetBy === "dm"
            ? `Your DM has you at ${String(you.initiative)}.`
            : you.initiative === null
              ? "Roll here, or type what you rolled at the table. Your DM sees it straight away and can change it."
              : `You sent ${String(you.initiative)}. You can change it until your DM starts the round.`}
        </p>
      </CardHeader>
      {you.initiativeSetBy !== "dm" && (
        <CardContent className="flex flex-col gap-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed !== undefined) void send(typed);
            }}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="your-initiative">Total</Label>
              <Input
                id="your-initiative"
                mono
                inputMode="numeric"
                value={draft}
                aria-invalid={draft.trim() !== "" && typed === undefined ? true : undefined}
                onChange={(event) => setDraft(event.target.value)}
                className="w-24"
              />
            </div>
            <Button type="submit" size="sm" disabled={busy || typed === undefined}>
              {busy ? "Sending…" : "Send"}
            </Button>
            {you.initiativeBonus !== null && (
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={roll}>
                <Icon name="dices" size={14} />
                Roll d20 {signed(you.initiativeBonus)}
              </Button>
            )}
          </form>
          {failure !== undefined && <SaveFailure failure={failure} />}
        </CardContent>
      )}
    </Card>
  );
}

function SessionNpcConversation({
  campaignId,
  sessionId,
  npc,
  refreshToken,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly npc: PlayerNpc;
  readonly refreshToken: number;
}) {
  const chat = useNpcSessionChat(campaignId, sessionId, npc.id, npc.name, refreshToken);
  return (
    <RehearsalPanel
      name={npc.name}
      image={npc.image}
      rehearsal={chat}
      subtitle="Open at the table · shared with active participants"
      emptyTitle={`Talk to ${npc.name}`}
      emptyBody="Open at the table is the shared live-session conversation. Everyone in this channel can read the exchange; the NPC cannot change the campaign or remember this automatically."
      label={`Say something to ${npc.name}`}
      ariaLabel={`Talk to ${npc.name}`}
    />
  );
}

export function SessionNpcCard({
  campaignId,
  sessionId,
  refreshToken,
}: {
  readonly campaignId: CampaignId;
  readonly sessionId: SessionId;
  readonly refreshToken: number;
}) {
  const [resource, reload] = useApiAtom(sessionNpcsAtom({ campaignId, sessionId }));
  const [selected, setSelected] = useState<NpcId | undefined>(undefined);

  useEffect(() => {
    if (refreshToken > 0) reload();
  }, [refreshToken, reload]);

  if (resource.state === "loading") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open at the table</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-s text-muted-foreground">Looking for shared NPCs…</p>
        </CardContent>
      </Card>
    );
  }
  if (resource.state === "failed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open at the table</CardTitle>
        </CardHeader>
        <CardContent>
          <ApiFailureNotice failure={resource.failure} onRetry={reload} />
        </CardContent>
      </Card>
    );
  }

  const npcs = resource.value;
  const npc = npcs.find((row) => row.id === selected) ?? npcs[0];
  if (npc === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>NPCs at the table</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-s leading-body text-muted-foreground">
            The DM has not opened an NPC at the table for this live session.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open at the table</CardTitle>
        <p className="text-body-s leading-body text-muted-foreground">
          This is the shared live-session conversation for active table participants.
          {npc.sessionState === "paused" ? " The DM has paused new messages for now." : ""}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {npcs.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {npcs.map((row) => (
              <Button
                key={row.id}
                size="sm"
                variant={row.id === npc.id ? "secondary" : "ghost"}
                onClick={() => setSelected(row.id)}
              >
                {row.name}
                {row.sessionState === "paused" && <Badge variant="secondary">paused</Badge>}
              </Button>
            ))}
          </div>
        )}
        <SessionNpcConversation
          campaignId={campaignId}
          sessionId={sessionId}
          npc={npc}
          refreshToken={refreshToken}
        />
      </CardContent>
    </Card>
  );
}

/** The shared read-alouds attached to the fight's encounter, in the book's own voice. */
export function ReadAloud({ notes }: { readonly notes: ReadonlyArray<PlayerNote> }) {
  if (notes.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => (
        <Card key={note.id}>
          <CardHeader>
            <span className="text-caption font-medium tracking-caps uppercase text-faint">
              Read aloud
            </span>
            <CardTitle>{note.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-measure font-serif text-body-l leading-loose italic text-foreground">
              {note.body}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
