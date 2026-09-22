import type { CampaignId, EncounterId } from "@taverns/api";
import { Button, Icon } from "@taverns/ui";
import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { asResource, useInvalidate } from "../api/atoms";
import { TopBar } from "../shell/TopBar";
import { FailureNotice, Loading } from "../ui/states";
import { useCampaignAct } from "./act";
import { CampaignDialog } from "./CampaignDialog";
import { FinishSessionDialog } from "./FinishSessionDialog";
import { InviteDialog } from "./InviteDialog";
import { campaignAtom, campaignViewAtom, campaignViewKeys, type CampaignView } from "./load";

/**
 * Everything the campaign's destinations have in common, once.
 *
 * **The campaign view was one screen with three tabs; the sixth delivery makes
 * it several screens.** `CampaignScreens.jsx` splits `CampaignHome.jsx` into
 * `CampOverview`, `CampEncounters` and `CampNotes`, because the delivery's
 * second nav row is a row of URLs and a tab is not one — see `routes.tsx`.
 *
 * What the split must not do is give the campaign several answers to what it is.
 * Whether the table is shared, who is invited, and finishing the night are facts
 * about the *campaign* rather than about whichever of its screens is open, so
 * they live here and every destination gets the same ones. A screen supplies its
 * own title, its own top-bar controls and its own body.
 *
 * The name, the way home, the session badge and the campaign's press are the
 * campaign row's, which reads them itself (`shell/AppShell.tsx`). A destination
 * used to hand them to the shell, and the two that composed a shell of their own
 * drew a row without the night or the press; `campaignRow.test.tsx` still visits
 * every destination the row offers.
 *
 * ### One value, three states — and eight atoms underneath it
 *
 * Every destination names the same `campaignViewAtom`, so it has the three
 * states a screen has and not sixty-four, and the second destination is
 * answered from the registry without a request.
 *
 * **What this file used to argue for, and no longer does.** It read: *"every
 * write on these screens changes something the screen did not send … one
 * re-read is one source of truth"*, and every structural write therefore ended
 * in a `reload()` that re-read the whole campaign. That was not wrong — a
 * narrower cache is right until the first write it did not hear about — and it
 * cost **one write and eight reads to add one line to a checklist**, measured
 * in a real browser. The captain took the trade on 2026-08-19: a write now says
 * which reads it changed, and adding a line costs one write and one read.
 *
 * So `loadCampaignView` is gone and `campaign/load.ts` is eight atoms combined
 * into one value — read that file for the shape, and `api/keys.ts` for what
 * bounds the risk this swapped in. The two failures the old argument named are
 * both still real and both answered by naming the resource rather than the
 * screen: `Encounter.creatureCount` is computed per read, so a roster write
 * refreshes `reads.encounters`; a note's attachment moves a count on an
 * encounter card, which is counted over the notes and so redraws when the notes
 * do.
 *
 * **`slots` therefore has no `reload`, and that is the point of the change
 * rather than an omission.** There is no way for a screen to say "something
 * happened, read everything again"; it says what it changed and the atoms that
 * answer it read themselves. The one re-read-everything left is the failure
 * notice's *Try again*, which is this file's own and is spelled in the same
 * vocabulary a write is (`campaignViewKeys`) — because a derived atom cannot be
 * refreshed, and "read the campaign again" really is "invalidate everything the
 * campaign is made of".
 *
 * ### What a screen reads *on top* of the campaign view
 *
 * The Party needs the roster and the invitations; the Chronicle needs the whole
 * spine of nights. Both used to have loaders of their own, and the obvious way
 * to keep them — a second resource beside the frame's — is the thing this file
 * exists to refuse: two of them is four combinations of loading and failed for
 * one screen. So a destination hands over an *atom*, the frame combines it with
 * the view through `AsyncResult.all` and it arrives as `slots.extra` — which
 * keeps every destination at one round and three states.
 *
 * It is also what keeps the cost to what it really is. Read alongside their own
 * loaders the two screens would ask for the campaign twice, the characters twice
 * and the current night's checklist twice; composed, each asks the frame's
 * questions once and adds only what the frame does not already answer — the
 * Party two calls, the Chronicle one.
 *
 * ### The sharing control is on the Overview and nowhere else
 *
 * *Private* / *Shared* and *Invite* are the campaign's own settings, so they sit
 * on the campaign's home screen rather than being repeated on all three bars.
 * The rule they were written for still holds — the current answer must be
 * legible as a **word** without opening anything, because an absent badge is not
 * a fail-closed default a DM can read — and the Overview is where a DM lands
 * when they open a table.
 */

/**
 * What a screen reads on top of the campaign view.
 *
 * The error channel is `unknown` on purpose: `asResource` narrows whatever
 * arrives through `classifyFailure`, which reads the decoded tag rather than a
 * declared type, so widening here costs a screen nothing and saves every caller
 * from restating the union of what six endpoints can fail with.
 */
export type CampaignExtraAtom<Extra> = Atom.Atom<AsyncResult.AsyncResult<Extra, unknown>>;

/**
 * The default: a destination that needs nothing beyond the campaign view.
 *
 * An atom that is already a success rather than one that reads nothing, so the
 * combination below has something to combine and the three destinations that
 * pass no `extra` cost no request at all.
 */
const NOTHING_ELSE: Atom.Atom<AsyncResult.AsyncResult<undefined, never>> = Atom.make(
  AsyncResult.success<undefined>(undefined),
);

/** What a destination is handed: the campaign, and the acts that belong to it. */
export interface CampaignChromeSlots<Extra = undefined> {
  readonly view: CampaignView;
  /**
   * What this screen's own `load` answered, in the same round as the view.
   *
   * `undefined` for a destination that passed no `load` — the three the frame
   * was written for, which render `CampaignView` and nothing else.
   */
  readonly extra: Extra;
  /** Put an encounter on the table, or walk back into the fight — see `CampaignActs.run`. */
  readonly run: (encounterId?: EncounterId) => void;
  /** Open the confirmation that ends the night. */
  readonly finishSession: () => void;
  /**
   * Raise one of the campaign's own dialogs.
   *
   * The dialogs themselves stay in the frame with the rest of the campaign-wide
   * state; this is how the Overview asks for one. See `CampaignSettingsButtons`.
   */
  readonly openSettings: (what: "campaign" | "invites") => void;
}

/** The campaign-wide dialogs, which any of the three screens may raise. */
type CampaignEditing = { readonly what: "campaign" } | { readonly what: "invites" };

export function CampaignChrome<Extra = undefined>({
  campaignId,
  title,
  subtitle,
  actions,
  tabs,
  extra: extraFrom,
  children,
}: {
  readonly campaignId: CampaignId;
  /** The per-screen top bar's title — *Overview*, *Party*, *Chronicle*, … */
  readonly title: string;
  readonly subtitle?: (slots: CampaignChromeSlots<Extra>) => string | undefined;
  /** This screen's own top-bar controls: its search box and its create button. */
  readonly actions?: (slots: CampaignChromeSlots<Extra>) => ReactNode;
  /** A tab strip for this screen, on `TopBar`'s own tab row below the title. */
  readonly tabs?: (slots: CampaignChromeSlots<Extra>) => ReactNode;
  /**
   * What this screen reads beyond the campaign view — see `CampaignExtraAtom`.
   *
   * An **atom**, built by the destination with an `Atom.family` at module
   * scope. The `useCallback`-stability this used to demand is gone: an atom is
   * its own identity, so there is nothing left for a caller to forget.
   */
  readonly extra?: CampaignExtraAtom<Extra>;
  readonly children: (slots: CampaignChromeSlots<Extra>) => ReactNode;
}) {
  /**
   * The `as` is the one thing the compiler cannot see — with `extra` omitted
   * `Extra` really is its `undefined` default, and there is no way to say so
   * from inside the generic.
   */
  const extraAtom: CampaignExtraAtom<Extra> =
    extraFrom ?? (NOTHING_ELSE as unknown as CampaignExtraAtom<Extra>);

  /**
   * Two atoms, one screen, three states.
   *
   * `AsyncResult.all` is the atom-shaped counterpart of the `Effect.all` this
   * used to compose, and it keeps the rule this file argues for at the top:
   * combining first and mapping once means a destination still renders three
   * states rather than the sixteen two independent resources would give it. It
   * is still one round — nothing a screen adds depends on the view's answer, and
   * the view's own two rounds are inside `campaign/load.ts`, where the real
   * dependency between the campaign row and the night hanging off it is.
   */
  const viewResult = useAtomValue(campaignViewAtom(campaignId));
  const extraResult = useAtomValue(extraAtom);
  const resource = useMemo(
    () => asResource(AsyncResult.all([viewResult, extraResult] as const)),
    [viewResult, extraResult],
  );

  /**
   * *Try again*, and it is the only re-read-everything left in the campaign.
   *
   * **The night's id comes from the campaign atom rather than from the view**,
   * and that is the whole reason this line exists: when the *checklist* is what
   * failed, the view is a failure and has no session to name — so a retry built
   * from `view.session` would refresh everything except the read that broke.
   * The campaign row is a part of its own and still has the answer.
   *
   * The view is derived, so it is retried by invalidating what it is made of
   * (`campaignViewKeys`); the screen's own `extra` is a real atom and is
   * refreshed directly, because the frame does not know what it reads.
   */
  const campaignResult = useAtomValue(campaignAtom(campaignId));
  const nightId = AsyncResult.isSuccess(campaignResult)
    ? (campaignResult.value.currentSessionId ?? undefined)
    : undefined;
  const invalidate = useInvalidate();
  const refreshExtra = useAtomRefresh(extraAtom);
  const retry = useCallback(() => {
    invalidate(campaignViewKeys(campaignId, nightId));
    refreshExtra();
  }, [invalidate, campaignId, nightId, refreshExtra]);
  const { run, dialogs } = useCampaignAct(campaignId);
  const [editing, setEditing] = useState<CampaignEditing | undefined>();
  /** Whether the "end the night" confirmation is up. */
  const [finishing, setFinishing] = useState(false);

  const loaded = resource.state === "ready" ? resource.value[0] : undefined;
  const extra = resource.state === "ready" ? resource.value[1] : undefined;

  // Which projection this URL renders is the route wrapper's decision now
  // (`CampaignRoute.tsx`), made from the same membership read before this
  // screen mounts — so by the time the frame is here, it is the creator's.
  const view = loaded;

  const close = useCallback(() => setEditing(undefined), []);
  const finishSession = useCallback(() => setFinishing(true), []);
  const openSettings = useCallback(
    (what: "campaign" | "invites") => setEditing({ what } as CampaignEditing),
    [],
  );

  const slots: CampaignChromeSlots<Extra> | undefined =
    view === undefined
      ? undefined
      : {
          view,
          // Read out of the same `ready` value the view came from, so a screen
          // never sees one half of one load.
          extra: extra as Extra,
          run,
          finishSession,
          openSettings,
        };

  return (
    <>
      <TopBar
        title={title}
        subtitle={slots === undefined ? undefined : subtitle?.(slots)}
        tabs={slots === undefined ? undefined : tabs?.(slots)}
      >
        {slots !== undefined && actions?.(slots)}
      </TopBar>
      {resource.state === "loading" && <Loading label="Reading the campaign…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={retry} />
        </div>
      )}
      {slots !== undefined && children(slots)}

      {editing?.what === "campaign" && view !== undefined && (
        <CampaignDialog campaign={view.campaign} onClose={close} onSaved={close} />
      )}
      {editing?.what === "invites" && view !== undefined && (
        // It stays open across several writes — minting a link, then
        // withdrawing another — so it has no `onSaved` at all: what a revoke
        // changes about the table underneath is `reads.members`, which the
        // dialog itself names.
        <InviteDialog campaign={view.campaign} onClose={close} />
      )}
      {finishing && view?.session !== undefined && (
        <FinishSessionDialog
          campaign={view.campaign}
          session={view.session}
          liveRun={view.run}
          onClose={() => setFinishing(false)}
          // The night is gone from under the screen — `campaign.currentSessionId`
          // is null now — and the dialog says so by naming `reads.campaign` and
          // `reads.sessions`. The frame only has to put the confirmation away.
          onFinished={() => setFinishing(false)}
        />
      )}
      {/* An encounter card's *Run*, and its cold branch that opens a night. */}
      {dialogs}
    </>
  );
}

/**
 * The campaign's own settings, for the one screen that carries them.
 *
 * Exported as a pair of buttons rather than inlined in the Overview so the
 * dialogs they open can stay in the frame with the rest of the campaign-wide
 * state: `CampaignChrome` renders them, the Overview asks for them.
 */
export function CampaignSettingsButtons({
  view,
  onOpen,
}: {
  readonly view: CampaignView;
  readonly onOpen: (what: "campaign" | "invites") => void;
}) {
  return (
    <>
      {/* The sharing control, worn as its own answer. `lock` and `users` are
          both already in the glyph table, and the word beside them is what keeps
          the fail-closed default from being something the DM has to infer from
          an absent badge. */}
      <Button
        variant="secondary"
        size="sm"
        /* The visible word leads, verbatim, so the accessible name contains the
           label a voice-control user would say. */
        aria-label={
          view.campaign.visibility === "shared"
            ? "Shared with your players — campaign settings"
            : "Private to you — campaign settings"
        }
        onClick={() => onOpen("campaign")}
      >
        <Icon name={view.campaign.visibility === "shared" ? "users" : "lock"} size={14} />
        {view.campaign.visibility === "shared" ? "Shared" : "Private"}
      </Button>
      <Button variant="secondary" size="sm" onClick={() => onOpen("invites")}>
        <Icon name="user-round" size={14} />
        Invite
      </Button>
    </>
  );
}
