import type { Npc } from "@taverns/api";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Badge, Button, Card, Icon } from "@taverns/ui";
import { Result } from "effect";
import { useState } from "react";
import { reads } from "../api/keys";
import { useMutation } from "../api/mutation";
import { CampaignChrome } from "../campaign/CampaignChrome";
import { DetailFacts, DetailSection } from "../ui/detail";
import { SaveFailure } from "../ui/form";
import { npcAtom } from "./load";
import { NpcAvatar } from "./NpcCard";
import { NpcDialog } from "./NpcDialog";
import { useNpcRehearsal } from "./rehearsal";
import { RehearsalPanel } from "./RehearsalPanel";

/**
 * One NPC: the persona as the creator wrote it, the rehearsal beside it, and
 * a small inspector under the persona.
 *
 * ### Two columns wide, one narrow — on the column's width
 *
 * The document is its own `@container`: above `@3xl` the persona and the
 * rehearsal sit side by side, below it they stack with the rehearsal first,
 * because on a narrow column the thing you came to do is hear them. No
 * viewport breakpoint anywhere, for the rule every screen here follows.
 *
 * ### The inspector shows metadata, never the prompt
 *
 * Template version, an estimate of the persona's size in tokens, the model
 * behind it, and — once a line has been answered — what that reply's prompt
 * measured. The assembled prompt itself is never on the wire (it carries the
 * private material), so there is nothing here that could show it.
 *
 * ### Archive is reversible and says so
 *
 * An archived NPC keeps its transcripts and takes no new lines; the screen
 * still renders it, with *Restore* where *Archive* was, and the rehearsal
 * composer replaced by the reason.
 */
export function NpcScreen() {
  const { campaignId, npcId } = useParams({ from: "/campaigns/$campaignId/cast/$npcId" });
  const [editing, setEditing] = useState(false);

  return (
    <CampaignChrome
      campaignId={campaignId}
      title="Cast"
      extra={npcAtom({ campaignId, npcId })}
      subtitle={({ extra }) => (extra.role === "" ? extra.name : `${extra.name} · ${extra.role}`)}
      actions={({ extra }) => (
        <>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link to="/campaigns/$campaignId/cast" params={{ campaignId }} />}
          >
            <Icon name="chevron-left" size={14} />
            All NPCs
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={14} />
            Edit
          </Button>
          <ArchiveButton npc={extra} />
        </>
      )}
    >
      {({ extra: npc }) => (
        <>
          <NpcBody npc={npc} />
          {editing && (
            <NpcDialog
              campaignId={campaignId}
              npc={npc}
              onClose={() => setEditing(false)}
              onSaved={() => setEditing(false)}
            />
          )}
        </>
      )}
    </CampaignChrome>
  );
}

function NpcBody({ npc }: { readonly npc: Npc }) {
  const rehearsal = useNpcRehearsal(npc.campaignId, npc.id, npc.name);
  const archived = npc.archivedAt !== null;

  return (
    <div className="@container">
      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The rehearsal leads on a narrow column and sits right on a wide one.
            Not sticky: the scroll container is the shell's column under a
            sticky `TopBar` whose height is neither a token nor constant, so a
            pinned panel would park its header under the bar (the Chronicle's
            aside records the same measurement). Its height is the viewport
            less the two nav rows, the bar and the gutters, so the composer
            is above the fold on load. */}
        <div className="order-1 flex min-h-96 flex-col @3xl:order-2 @3xl:h-[calc(100vh-var(--spacing)*60)] @3xl:max-h-[52rem]">
          <RehearsalPanel
            name={npc.name}
            rehearsal={
              archived
                ? {
                    ...rehearsal,
                    send: undefined,
                    unavailable: `${npc.name} is archived. Restore them to rehearse again; the transcript is kept either way.`,
                  }
                : rehearsal
            }
          />
        </div>

        <div className="order-2 flex flex-col gap-4 @3xl:order-1">
          <Card className="gap-4 p-card">
            <div className="flex items-start gap-3">
              <NpcAvatar name={npc.name} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-title leading-title font-semibold text-heading">
                  {npc.name}
                </h2>
                {npc.role !== "" && (
                  <p className="text-body-s leading-body text-muted-foreground">{npc.role}</p>
                )}
              </div>
              {archived && <Badge variant="outline">Archived</Badge>}
            </div>

            <Persona npc={npc} />
          </Card>

          <Inspector npc={npc} rehearsal={rehearsal} />
        </div>
      </div>
    </div>
  );
}

/** The persona, as the creator wrote it: the public half, then the private half, marked. */
function Persona({ npc }: { readonly npc: Npc }) {
  const identity = npc.persona.identity;
  const voice = npc.persona.voice;
  const intent = npc.persona.intent;
  const bounds = npc.persona.boundaries;
  const hasPrivate =
    (npc.privateMaterial.secrets ?? "") !== "" || (npc.privateMaterial.instructions ?? "") !== "";
  const written =
    identity !== undefined ||
    voice !== undefined ||
    intent !== undefined ||
    bounds !== undefined ||
    hasPrivate;

  if (!written) {
    return (
      <p className="text-body-s leading-body text-muted-foreground">
        No persona written yet. Press <span className="text-heading">Edit</span> to give them a
        voice — they will answer as a blank slate until you do.
      </p>
    );
  }

  return (
    <>
      {identity?.summary !== undefined && (
        <p className="text-body-s leading-body text-foreground">{identity.summary}</p>
      )}
      {(identity?.pronouns !== undefined || identity?.pronunciation !== undefined) && (
        <DetailFacts
          facts={[
            ...(identity.pronouns === undefined
              ? []
              : [{ label: "Pronouns", value: identity.pronouns }]),
            ...(identity.pronunciation === undefined
              ? []
              : [{ label: "Said", value: identity.pronunciation }]),
          ]}
        />
      )}
      {voice !== undefined && (
        <DetailSection title="Voice">
          {voice.manner !== undefined && <Prose>{voice.manner}</Prose>}
          <Lines label="Phrases" lines={voice.phrases} />
          <Lines label="Lines they have said" lines={voice.exampleLines} quoted />
        </DetailSection>
      )}
      {intent !== undefined && (
        <DetailSection title="Motives">
          <DetailFacts
            facts={[
              ...(intent.wants === undefined ? [] : [{ label: "Wants", value: intent.wants }]),
              ...(intent.fears === undefined ? [] : [{ label: "Fears", value: intent.fears }]),
              ...(intent.loyalties === undefined
                ? []
                : [{ label: "Loyal to", value: intent.loyalties }]),
              ...(intent.attitude === undefined
                ? []
                : [{ label: "Toward the party", value: intent.attitude }]),
            ]}
          />
        </DetailSection>
      )}
      {bounds !== undefined && (
        <DetailSection title="Boundaries">
          <Lines label="Dodges" lines={bounds.dodges} />
          <Lines label="Refuses" lines={bounds.refuses} />
          <Lines label="Says to ask the DM" lines={bounds.asksTheDm} />
        </DetailSection>
      )}
      {hasPrivate && (
        <DetailSection title="Private material">
          <p className="flex items-center gap-1.5 text-caption leading-body text-muted-foreground">
            <Icon name="lock" size={12} className="text-faint" />
            Only you see this. Your rehearsal uses it; a player channel never would.
          </p>
          {npc.privateMaterial.secrets !== undefined && (
            <Fact label="Secrets">{npc.privateMaterial.secrets}</Fact>
          )}
          {npc.privateMaterial.instructions !== undefined && (
            <Fact label="Instructions from you">{npc.privateMaterial.instructions}</Fact>
          )}
        </DetailSection>
      )}
    </>
  );
}

function Prose({ children }: { readonly children: string }) {
  return <p className="text-body-s leading-body whitespace-pre-wrap text-foreground">{children}</p>;
}

function Fact({ label, children }: { readonly label: string; readonly children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
        {label}
      </span>
      <Prose>{children}</Prose>
    </div>
  );
}

function Lines({
  label,
  lines,
  quoted = false,
}: {
  readonly label: string;
  readonly lines: ReadonlyArray<string> | undefined;
  readonly quoted?: boolean;
}) {
  if (lines === undefined || lines.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-micro leading-snug font-medium tracking-caps text-faint uppercase">
        {label}
      </span>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {lines.map((line) => (
          <li
            key={line}
            className={
              quoted
                ? "font-serif text-body leading-body text-foreground italic"
                : "text-body-s leading-body text-foreground"
            }
          >
            {quoted ? `“${line}”` : line}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Prompt metadata, and nothing more. Small on purpose — the design's
 * "developer-ish diagnostics live in an inspector, not in the builder".
 */
function Inspector({
  npc,
  rehearsal,
}: {
  readonly npc: Npc;
  readonly rehearsal: ReturnType<typeof useNpcRehearsal>;
}) {
  const status = rehearsal.status;
  return (
    <Card tone="sunken" className="gap-3 p-card" aria-label="Prompt inspector">
      <h3 className="flex items-center gap-2 text-micro leading-snug font-medium tracking-caps text-faint uppercase">
        <Icon name="info" size={12} />
        Prompt inspector
      </h3>
      <DetailFacts
        facts={[
          {
            label: "Template",
            value: status === undefined ? "…" : status.templateVersion,
          },
          {
            label: "Persona size",
            value: status === undefined ? "…" : `about ${String(status.estimatedTokens)} tokens`,
          },
          {
            label: "Model",
            value: status === undefined ? "…" : (status.model ?? "none configured"),
          },
          ...(rehearsal.lastPrompt === undefined
            ? []
            : [
                {
                  label: "Last reply",
                  value: `about ${String(rehearsal.lastPrompt.estimatedTokens)} tokens sent, ${rehearsal.lastPrompt.templateVersion}`,
                },
              ]),
          { label: "Persona version", value: String(npc.version) },
        ]}
      />
      <p className="text-caption leading-body text-muted-foreground">
        The prompt itself is never shown or stored: it carries your private material.
      </p>
    </Card>
  );
}

/** Archive, or restore — the reversible soft delete, one press each way. */
function ArchiveButton({ npc }: { readonly npc: Npc }) {
  const { busy, failure, submit } = useMutation();
  const navigate = useNavigate();
  const archived = npc.archivedAt !== null;

  const press = async () => {
    const outcome = await submit(
      (client) =>
        archived
          ? client.npcs.restore({
              params: { campaignId: npc.campaignId, npcId: npc.id },
              payload: {},
            })
          : client.npcs.archive({
              params: { campaignId: npc.campaignId, npcId: npc.id },
              payload: {},
            }),
      [reads.npcs(npc.campaignId), reads.npc(npc.id)],
    );
    if (Result.isSuccess(outcome) && !archived) {
      void navigate({ to: "/campaigns/$campaignId/cast", params: { campaignId: npc.campaignId } });
    }
  };

  return (
    <span className="flex items-center gap-2">
      {failure !== undefined && <SaveFailure failure={failure} />}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void press()}>
        <Icon name={archived ? "refresh-cw" : "eye-off"} size={14} />
        {archived ? "Restore" : "Archive"}
      </Button>
    </span>
  );
}
