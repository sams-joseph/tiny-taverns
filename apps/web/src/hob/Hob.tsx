import type { HobAccepted, HobKept } from "@taverns/api";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { AsyncResult, Atom } from "effect/reactivity";
import { useCallback, useEffect } from "react";
import { useApiAtom } from "../api/atoms";
import { membershipsAtom } from "../campaign/load";
import { myCharactersAtom } from "../characters/load";
import { sharedWorldsAtom } from "../shared-world/load";
import {
  useCampaignId,
  useCampaignRelation,
  useSection,
  useSharedWorldId,
} from "../shell/location";
import { HobDock } from "./HobDock";
import { useHobConversation, type HobScope } from "./conversation";
import { type AccountScreen, hobOpeningFor, type HobKnown, type HobPlace } from "./suggestions";
import type { HobPanelState } from "./useHobPanel";

/** The account's scope is one value, so it is one object. */
const ACCOUNT: HobScope = { type: "account" };

/**
 * What the panel is about, read off the route.
 *
 * The persistent layout mounts one panel for every screen, so the scope cannot
 * be a prop: it changes under the panel as the reader moves, and the panel stays
 * open while it does. A campaign or a Shared World, never both; on every other
 * screen it is the reader's own account (`/me/hob`), which drafts a campaign or
 * a character.
 *
 * **A player's campaign is no scope.** The docked panel's verbs there are
 * creator writes, which is why *Ask Hob* is absent for a player (`AskHobSlot`);
 * a panel carried open into a player's table goes quiet rather than asking on
 * their behalf. While the relation is settling it is no scope either, for the
 * same reason the campaign row draws no items then.
 */
function useHobScope(): HobScope | undefined {
  const campaignId = useCampaignId();
  const worldId = useSharedWorldId();
  const relation = useCampaignRelation(campaignId);
  if (campaignId !== undefined) {
    return relation === "creator" ? { type: "campaign", id: campaignId } : undefined;
  }
  return worldId === undefined ? ACCOUNT : { type: "sharedWorld", id: worldId };
}

/**
 * Stand-ins read where the screen holds no such list, so a hook that cannot be
 * skipped subscribes to nothing and requests nothing (`location.ts` does the
 * same for the membership read).
 */
const noMemberships: typeof membershipsAtom = Atom.make(AsyncResult.initial());
const noWorlds: typeof sharedWorldsAtom = Atom.make(AsyncResult.initial());
const noCharacters: typeof myCharactersAtom = Atom.make(AsyncResult.initial());

/**
 * Where the reader is, for `hobOpeningFor` — and what the screen behind the
 * panel has already read.
 *
 * Each count is read only on the screen that holds that list, and only while
 * the panel is open, so it is the screen's own read shared rather than a new
 * one: the Campaigns list holds the memberships and the worlds, the roster its
 * characters, the Shared Worlds list its worlds. Anywhere else a count is
 * unknown and nothing is said about it.
 */
function useHobPlace(scope: HobScope | undefined, open: boolean): HobPlace {
  const section = useSection();
  const matchRoute = useMatchRoute();
  const screen: AccountScreen =
    matchRoute({ to: "/worlds" }) !== false
      ? "sharedWorlds"
      : section === "campaigns" || section === "characters" || section === "library"
        ? section
        : "elsewhere";
  const reading = scope?.type === "account" && open;
  const [memberships] = useApiAtom(
    reading && screen === "campaigns" ? membershipsAtom : noMemberships,
  );
  const [worlds] = useApiAtom(
    reading && (screen === "campaigns" || screen === "sharedWorlds") ? sharedWorldsAtom : noWorlds,
  );
  const [characters] = useApiAtom(
    reading && screen === "characters" ? myCharactersAtom : noCharacters,
  );

  if (scope === undefined || scope.type === "campaign") return { kind: "campaign" };
  if (scope.type === "sharedWorld") return { kind: "sharedWorld" };
  const known: HobKnown = {
    // The tables this account runs: a seat at somebody else's is not one.
    ...(memberships.state === "ready"
      ? { campaigns: memberships.value.filter((row) => row.relation === "creator").length }
      : {}),
    ...(worlds.state === "ready" ? { sharedWorlds: worlds.value.length } : {}),
    ...(characters.state === "ready" ? { characters: characters.value.characters.length } : {}),
  };
  return { kind: "account", screen, known };
}

/**
 * The panel, wired to whatever is behind it. This is what a shell mounts.
 *
 * Four things, and no more: it asks `conversation.ts` for a conversation, it
 * hands `HobDock` the open/inline decision the shell already owns, it passes on
 * the scope in view and the starters `suggestions.ts` picks for that place, and
 * it opens what a kept card made — on the keep for a campaign, a Shared World or
 * a character, and on *Open it* for anything kept. Everything else — the parts,
 * the states, the 1020px threshold, the layering — lives below it, and the
 * shell needs to know none of it.
 *
 * ```tsx
 * const hob = useHobPanel();
 * // …in the top bar: <Button onClick={hob.toggle}>Ask Hob ⌘K</Button>
 * <HobFrame panel={<Hob hob={hob} />}>
 *   <div className="flex min-w-0 flex-1 flex-col">
 *     …the bars…
 *     <HobRegion>
 *       <div className="relative flex min-w-0 flex-1 flex-col">…</div>
 *     </HobRegion>
 *   </div>
 * </HobFrame>
 * ```
 */
export function Hob({ hob }: { readonly hob: HobPanelState }) {
  const scope = useHobScope();
  const navigate = useNavigate();
  const { inline, close } = hob;

  /**
   * A kept campaign, Shared World or character opens, which is where the
   * reader was going: the new table, the new world, or the new sheet.
   * Overlaid, the panel closes too, since it covers the screen that just
   * opened.
   */
  const onKept = useCallback(
    (accepted: HobAccepted) => {
      switch (accepted.accepted) {
        case "campaign":
          if (!inline) close();
          void navigate({
            to: "/campaigns/$campaignId",
            params: { campaignId: accepted.campaign.id },
          });
          return;
        case "sharedWorld":
          if (!inline) close();
          void navigate({
            to: "/worlds/$worldId",
            params: { worldId: accepted.sharedWorld.id },
          });
          return;
        case "character":
          if (!inline) close();
          void navigate({
            to: "/characters/$characterId",
            params: { characterId: accepted.character.id },
          });
          return;
      }
    },
    [close, inline, navigate],
  );

  /**
   * *Open it*: the screen a kept card's pointer names — the row itself where
   * it has a screen, and otherwise the page it landed on, which is what the
   * card's footer says (*In the Chronicle*, *In the Cast*). Campaign kinds are
   * addressed under the campaign in view, which is the only one whose
   * conversation holds them.
   */
  const onOpen = useCallback(
    (kept: HobKept) => {
      const campaignId = scope?.type === "campaign" ? scope.id : undefined;
      const go = (): Promise<void> | undefined => {
        switch (kept.accepted) {
          case "campaign":
            return navigate({ to: "/campaigns/$campaignId", params: { campaignId: kept.id } });
          case "sharedWorld":
            return navigate({ to: "/worlds/$worldId", params: { worldId: kept.id } });
          case "character":
            return navigate({
              to: "/characters/$characterId",
              params: { characterId: kept.id },
            });
          // A kept level-up is on the character's sheet, and its Log.
          case "levelUp":
            return navigate({
              to: "/characters/$characterId",
              params: { characterId: kept.characterId },
            });
          case "sharedWorldHistory":
            return navigate({
              to: "/worlds/$worldId/chronicle",
              params: { worldId: kept.worldId },
            });
          // The Story So Far is the world's page's own card.
          case "sharedWorldSummary":
            return navigate({ to: "/worlds/$worldId", params: { worldId: kept.worldId } });
        }
        if (campaignId === undefined) return undefined;
        switch (kept.accepted) {
          case "note":
            return navigate({
              to: "/campaigns/$campaignId/notes",
              params: { campaignId },
              search: { note: kept.id },
            });
          case "encounter":
            return navigate({
              to: "/campaigns/$campaignId/encounters/$encounterId",
              params: { campaignId, encounterId: kept.id },
            });
          case "npc":
            return navigate({
              to: "/campaigns/$campaignId/cast",
              params: { campaignId },
              search: { npc: kept.id },
            });
          case "npcSheet":
            return navigate({
              to: "/campaigns/$campaignId/cast",
              params: { campaignId },
              search: { npc: kept.npcId },
            });
          case "beat":
          case "nightSummary":
          case "night":
            return navigate({
              to: "/campaigns/$campaignId/chronicle",
              params: { campaignId },
              search: { session: kept.sessionId },
            });
          case "act":
          case "campaignStory":
            return navigate({ to: "/campaigns/$campaignId/chronicle", params: { campaignId } });
        }
      };
      // Overlaid, the panel covers the screen being opened.
      if (go() !== undefined && !inline) close();
    },
    [close, inline, navigate, scope],
  );

  return (
    <ScopedHob
      hob={hob}
      scope={scope}
      place={useHobPlace(scope, hob.open)}
      onKept={onKept}
      onOpen={onOpen}
    />
  );
}

/**
 * The same panel with the scope named rather than read — for a test that has
 * no route to stand at, and for asserting what a change of scope does. `place`
 * defaults to the scope's own, with nothing known about the screen.
 */
export function ScopedHob({
  hob,
  scope,
  place,
  onKept,
  onOpen,
}: {
  readonly hob: HobPanelState;
  readonly scope: HobScope | undefined;
  readonly place?: HobPlace;
  readonly onKept?: (accepted: HobAccepted) => void;
  /** *Open it* on a kept card. Absent, no card offers to open. */
  readonly onOpen?: (kept: HobKept) => void;
}) {
  const conversation = useHobConversation(scope, hob.open, onKept, onOpen);
  const { asked, forgetAsked } = hob;
  const { send, asking } = conversation;
  // A question a screen asked (`hob.ask`) goes as soon as the conversation can
  // hear it: once the panel's status has answered, and not over an answer
  // still arriving. Taken first, so a re-render cannot send it twice.
  useEffect(() => {
    if (asked === undefined || send === undefined || asking) return;
    forgetAsked();
    send(asked);
  }, [asked, send, asking, forgetAsked]);
  const opening = hobOpeningFor(
    place ??
      (scope?.type === "account"
        ? { kind: "account", screen: "elsewhere", known: {} }
        : scope?.type === "sharedWorld"
          ? { kind: "sharedWorld" }
          : { kind: "campaign" }),
  );

  return (
    <HobDock
      open={hob.open}
      inline={hob.inline}
      onClose={hob.close}
      turns={conversation.turns}
      thinking={conversation.thinking}
      answering={conversation.asking}
      activity={conversation.activity}
      context={conversation.context}
      savedArtifactIds={conversation.savedArtifactIds}
      onSend={conversation.send}
      unavailable={conversation.unavailable}
      {...(opening.title === undefined ? {} : { emptyTitle: opening.title })}
      {...(opening.description === undefined ? {} : { emptyDescription: opening.description })}
      starters={opening.starters}
      onSave={conversation.save}
      onDiscard={conversation.discard}
      onRetry={conversation.retry}
      onOpenArtifact={conversation.open}
      openableArtifactIds={conversation.openableArtifactIds}
      onNewThread={conversation.reset}
    />
  );
}
