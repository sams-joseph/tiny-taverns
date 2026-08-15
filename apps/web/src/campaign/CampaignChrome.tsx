import type { CampaignId, EncounterId } from "@taverns/api";
import { useNavigate, type LinkProps } from "@tanstack/react-router";
import { Badge, Button, Icon, type IconName } from "@taverns/ui";
import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource } from "../api/resource";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { FailureNotice, Loading } from "../ui/states";
import { CampaignDialog } from "./CampaignDialog";
import { FinishSessionDialog } from "./FinishSessionDialog";
import { InviteDialog } from "./InviteDialog";
import { loadCampaignView, type CampaignView } from "./load";
import { StartRunDialog } from "./StartRunDialog";
import { StartSessionDialog } from "./StartSessionDialog";

/**
 * Everything the campaign's five destinations have in common, once.
 *
 * **The campaign view was one screen with three tabs; the sixth delivery makes
 * it three screens.** `CampaignScreens.jsx` splits `CampaignHome.jsx` into
 * `CampOverview`, `CampEncounters` and `CampNotes`, because the delivery's
 * second nav row is a row of URLs and a tab is not one — see `routes.tsx`.
 *
 * What the split must not do is give the campaign several answers to what it is.
 * The name in the bar, the way home, the session badge, whether the table is
 * shared, who is invited, and starting or finishing the night are facts about
 * the *campaign* rather than about whichever of its screens is open, so they
 * live here and every destination gets the same ones. A screen supplies its own
 * title, its own top-bar controls and its own body, which is the same seam the
 * shell already has with every other screen in the product.
 *
 * ### Party and the Chronicle are destinations too, and the rule cost something
 *
 * Both were built before the split and both composed `AppShell` themselves,
 * passing `campaignName` and nothing else. That is not a stylistic difference:
 * the badge and the campaign action are props of the shell, so a screen that
 * builds its own row simply has no way to draw them, **and the campaign row on
 * two of its five destinations silently lost the night it is preparing and the
 * one press it offers.** It reads as intermittent — same night, same width,
 * different tab — which is what took it so long to be reported as a bug rather
 * than as a layout quirk. `campaignRow.test.tsx` is what fails now instead: it
 * enumerates the DM row's own destinations, so a sixth screen that hand-builds a
 * shell cannot ship.
 *
 * ### One `Effect`, per screen, still
 *
 * Each destination composes `loadCampaignView` once, so it has the three states
 * `useApiResource` gives and not sixty-four. Five screens over one loader is
 * five loads where there used to be one — a real cost, and the honest one:
 * moving between Encounters and Notes now re-reads the campaign. The
 * alternative is a cache that is right until the first write it did not hear
 * about, and every write on these screens changes something the screen did not
 * send (`Encounter.creatureCount` is computed per read, a note's attachment
 * moves a count on a different card). One re-read is one source of truth.
 *
 * ### What a screen reads *on top* of the campaign view
 *
 * The Party needs the roster and the invitations; the Chronicle needs the whole
 * spine of nights. Both used to have loaders of their own, and the obvious way
 * to keep them — a second `useApiResource` beside the frame's — is the thing
 * this file exists to refuse: two resources is four combinations of loading and
 * failed for one screen, and two `reload`s for one write. So `load` composes
 * into the *same* Effect and arrives as `slots.extra`, which keeps every
 * destination at one call, three states and one re-read.
 *
 * It is also what keeps the cost to what it really is. Read alongside their own
 * loaders the two screens would ask for the campaign twice, the characters twice
 * and the current night's checklist twice; composed, each asks the frame's
 * questions once and adds only what the frame does not already answer — the
 * Party two calls, the Chronicle one. The frame's own reads are still added to
 * screens that did not make them before, and that is the stated price of one
 * source of truth rather than something to cache away.
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
 * The one press the campaign offers, whichever of its three things it is.
 *
 * **It is drawn twice** — on the campaign row, where it follows the DM across
 * all six of the campaign's screens, and in the Overview's *Next session* card,
 * which is the delivery's contextual, primary one. Both are the delivery's, and
 * both must say the same thing: two controls computing the same three-way branch
 * independently is two controls that can differ, and with three states rather
 * than two that stopped being a theoretical risk. So it is computed once, here,
 * and both call sites render it.
 */
export interface CampaignAct {
  readonly label: string;
  readonly icon: IconName;
  readonly press: () => void;
}

/**
 * What a screen reads on top of the campaign view.
 *
 * The error channel is `unknown` on purpose: `useApiResource` narrows whatever
 * arrives through `classifyFailure`, which reads the decoded tag rather than a
 * declared type, so widening here costs a screen nothing and saves every caller
 * from restating the union of what six endpoints can fail with.
 */
export type CampaignExtraLoad<Extra> = (
  client: TavernsClient,
) => Effect.Effect<Extra, unknown, HttpClient.HttpClient>;

/** The default: a destination that needs nothing beyond the campaign view. */
const nothingElse = () => Effect.succeed(undefined);

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
  /** Re-read the whole view — what every structural write here ends with. */
  readonly reload: () => void;
  /**
   * Put an encounter on the table, or walk back into the fight already on it.
   *
   * One function for both because it is one press to a DM, and which of the two
   * it is depends on `view.run`, which lives here. **It opens a night if there
   * is not one** — `StartRunDialog`'s cold branch — so an encounter card's *Run*
   * still works in one step on a campaign that has never played.
   */
  readonly run: (encounterId?: EncounterId) => void;
  /**
   * The primary press for this campaign, in whichever of its three states —
   * including opening the night, which is why no screen is handed a
   * `startSession` of its own. One press computed once; see `CampaignAct`.
   */
  readonly act: CampaignAct;
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

/**
 * The three states, and the words for each.
 *
 * They used to be two — `live === undefined ? "Start session" : "Back to the
 * fight"` — and that was wrong the moment a night could be open with nothing on
 * the table: `live` is still undefined there, so the campaign would offer *Start
 * session* for a session already running and the press would try to open a
 * second one. **The session and the run are two questions and are asked
 * separately.**
 */
const actFor = (view: CampaignView, onRun: () => void, onStartSession: () => void): CampaignAct =>
  view.run !== undefined
    ? { label: "Back to the fight", icon: "swords", press: onRun }
    : view.session === undefined
      ? { label: "Start session", icon: "play", press: onStartSession }
      : // The night is open. What is left to do is the DM's discretion — an
        // encounter goes on the table when the party reaches one — so the press
        // is the fight rather than a second night.
        { label: "Start an encounter", icon: "swords", press: onRun };

export function CampaignChrome<Extra = undefined>({
  campaignId,
  title,
  subtitle,
  actions,
  load,
  children,
}: {
  readonly campaignId: CampaignId;
  /** The per-screen top bar's title — *Overview*, *Party*, *Chronicle*, … */
  readonly title: string;
  readonly subtitle?: (slots: CampaignChromeSlots<Extra>) => string | undefined;
  /** This screen's own top-bar controls: its search box and its create button. */
  readonly actions?: (slots: CampaignChromeSlots<Extra>) => ReactNode;
  /**
   * What this screen reads beyond the campaign view — see `CampaignExtraLoad`.
   *
   * **Must be `useCallback`-stable**, for the reason every `useApiResource`
   * callback is: its identity is what says "load again", so an inline closure
   * here loads forever.
   */
  readonly load?: CampaignExtraLoad<Extra>;
  readonly children: (slots: CampaignChromeSlots<Extra>) => ReactNode;
}) {
  /**
   * Stable without a memo: `nothingElse` is module-level, and a screen that
   * passes one has already memoised it. The `as` is the one thing the compiler
   * cannot see — with `load` omitted `Extra` really is its `undefined` default,
   * and there is no way to say so from inside the generic.
   */
  const readExtra: CampaignExtraLoad<Extra> =
    load ?? (nothingElse as unknown as CampaignExtraLoad<Extra>);

  // Memoised on the id and the screen's own loader: their identity is what
  // tells `useApiResource` to load again, so an unmemoised closure here would
  // load forever.
  const read = useCallback(
    (client: TavernsClient) =>
      // One round: nothing a screen adds depends on the view's answer, and the
      // view's own two rounds are inside `loadCampaignView` where the real
      // dependency is.
      Effect.all([loadCampaignView(campaignId)(client), readExtra(client)], {
        concurrency: "unbounded",
      }),
    [campaignId, readExtra],
  );
  const [resource, reload] = useApiResource(read);
  // Closed by default — see `CampaignsScreen`, and `useHobPanel`'s own note.
  const hob = useHobPanel({ initialOpen: false });
  const navigate = useNavigate();
  const [editing, setEditing] = useState<CampaignEditing | undefined>();
  /** The encounter the DM pressed Run on, while the start dialog is open. */
  const [starting, setStarting] = useState<{ readonly encounterId: EncounterId | undefined }>();
  /** Whether the "open the night" confirmation is up. */
  const [opening, setOpening] = useState(false);
  /** Whether the "end the night" confirmation is up. */
  const [finishing, setFinishing] = useState(false);

  const loaded = resource.state === "ready" ? resource.value[0] : undefined;
  const extra = resource.state === "ready" ? resource.value[1] : undefined;

  /**
   * **A player who arrives here is handed the screen that works.**
   *
   * Nothing in the product links a player at any of these URLs — the campaign
   * list and the invitation page both route by role — but a bookmark, or a link
   * a DM pasted into a chat, still can. It does not fail loudly if they do:
   * every read the first round makes succeeds for a player, narrowed, so these
   * screens would draw a DM's chrome (*New encounter*, *Ask Hob*, the sharing
   * control, the whole campaign row) over a player's data and break only on the
   * press. Knowing the role is what lets them be handed the one that works.
   *
   * `replace`, so *Back* goes where they came from instead of returning here.
   */
  const wrongSide = loaded?.role === "player";
  useEffect(() => {
    if (wrongSide) {
      void navigate({
        to: "/play/campaigns/$campaignId",
        params: { campaignId },
        replace: true,
      });
    }
  }, [wrongSide, campaignId, navigate]);

  // Withheld for the frame before the hash lands, so none of this screen's
  // chrome is ever drawn for somebody it does not belong to.
  const view = wrongSide ? undefined : loaded;

  const close = useCallback(() => setEditing(undefined), []);
  const saved = useCallback(() => {
    setEditing(undefined);
    reload();
  }, [reload]);

  /**
   * Where the runner is, when there is a fight to go back to.
   *
   * Memoised because it is an object: a fresh literal every render would give
   * `run` a fresh identity every render, and `run` reaches an encounter grid.
   */
  const live: LinkProps | undefined = useMemo(
    () =>
      view?.run !== undefined && view.session !== undefined
        ? {
            to: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
            params: { campaignId, sessionId: view.session.id, runId: view.run.id },
          }
        : undefined,
    [campaignId, view?.run, view?.session],
  );

  const run = useCallback(
    (encounterId?: EncounterId) => {
      if (live !== undefined) {
        void navigate(live);
        return;
      }
      setStarting({ encounterId });
    },
    [live, navigate],
  );

  const startSession = useCallback(() => setOpening(true), []);
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
          reload,
          run,
          act: actFor(view, () => run(), startSession),
          finishSession,
          openSettings,
        };

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} campaignId={campaignId} />}
      campaignName={view?.campaign.name}
      campaignBadge={
        view?.session === undefined ? undefined : (
          <Badge variant="secondary">Session {view.session.number}</Badge>
        )
      }
      /* The delivery puts *Start session* on the campaign row, pushed right, and
         it belongs to the campaign rather than to whichever screen is open —
         which is exactly why it moved off the per-screen bar. It says which of
         the three things it is (`actFor`), and the Overview's card renders the
         same value rather than branching again. */
      campaignActions={
        slots === undefined ? undefined : (
          <Button size="sm" onClick={slots.act.press}>
            <Icon name={slots.act.icon} size={13} />
            {slots.act.label}
          </Button>
        )
      }
      topBar={
        <TopBar title={title} subtitle={slots === undefined ? undefined : subtitle?.(slots)}>
          {slots !== undefined && actions?.(slots)}
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Reading the campaign…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}
      {slots !== undefined && children(slots)}

      {editing?.what === "campaign" && view !== undefined && (
        <CampaignDialog campaign={view.campaign} onClose={close} onSaved={saved} />
      )}
      {editing?.what === "invites" && view !== undefined && (
        // `onChanged` rather than `onSaved`: this dialog stays open across
        // several writes — minting a link, then withdrawing another — so it
        // re-reads the view underneath without closing itself.
        <InviteDialog campaign={view.campaign} onClose={close} onChanged={reload} />
      )}
      {finishing && view?.session !== undefined && (
        <FinishSessionDialog
          campaign={view.campaign}
          session={view.session}
          liveRun={view.run}
          onClose={() => setFinishing(false)}
          onFinished={() => {
            setFinishing(false);
            // The night is gone from under the screen: `campaign.currentSessionId`
            // is null now, so the checklist, the session card and the campaign
            // row's "Start session" all have a different answer. One re-read,
            // the same rule every structural write here follows.
            reload();
          }}
        />
      )}
      {opening && view !== undefined && (
        <StartSessionDialog
          campaign={view.campaign}
          onClose={() => setOpening(false)}
          onStarted={() => {
            setOpening(false);
            // The night is on the screen now: `campaign.currentSessionId` names
            // it, so the checklist, the session card and the campaign row's own
            // button all have a different answer. There is no run to navigate
            // to — that is the whole point of this door — so the DM stays where
            // they are and the screen catches up. One re-read, the same rule
            // every structural write here follows.
            reload();
          }}
        />
      )}
      {starting !== undefined && view !== undefined && (
        <StartRunDialog
          campaign={view.campaign}
          session={view.session}
          encounters={view.encounters}
          preselected={starting.encounterId}
          onClose={() => setStarting(undefined)}
          onStarted={(sessionId, runId) => {
            setStarting(undefined);
            void navigate({
              to: "/campaigns/$campaignId/sessions/$sessionId/runs/$runId",
              params: { campaignId, sessionId, runId },
            });
          }}
        />
      )}
    </AppShell>
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
