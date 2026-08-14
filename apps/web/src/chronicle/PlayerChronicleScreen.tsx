import type { SessionId } from "@taverns/api";
import { useParams } from "@tanstack/react-router";
import { Icon, Toggle } from "@taverns/ui";
import { useCallback, useState } from "react";
import type { TavernsClient } from "../api/client";
import { useApiResource } from "../api/resource";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { loadPlayerChronicle } from "./load";
import { PlayerRecapBody } from "./PlayerRecapBody";
import { SessionEntry } from "./SessionEntry";

/**
 * The record of a table you sit at.
 *
 * `ui_kits/dm-screen/Chronicle.jsx` again — **the same screen, seen through the
 * narrower projection**, which is the whole of what the fourth delivery means by
 * a player Chronicle. The spine, the dot-and-rule, the one-card-at-a-time
 * behaviour and the *Read aloud* toggle are `SessionEntry` and `recapParts.tsx`,
 * shared with the DM's; what differs is the endpoint each open card reads and
 * therefore how much of a fight it may say (`PlayerRecapBody`).
 *
 * ### Why this is the safe first record screen
 *
 * A mistake here is a blank page, not a disclosure, and that property is bought
 * rather than hoped for: `recap.readAsPlayer` answers `PlayerSessionRecap`,
 * which has **no field** for a monster's armour class or exact hit points. So
 * every read on this screen is one a player may make, and widening it would take
 * a schema change one repository away — not a forgotten flag here. That is the
 * decision of 2026-08-12 doing the work it was taken to do; see `PlayerRecap.ts`
 * and `AGENTS.md`'s "gate first, project later".
 *
 * ### What it deliberately does not carry
 *
 * - **The *"Threads still open"* aside.** It is the unticked half of the DM's
 *   own checklist — their loose ends, in their voice. See `load.ts`.
 * - **The search box.** `GET /campaigns/:c/search` is not gated and would answer
 *   a player their narrowed corpus honestly, but three of its four arms are the
 *   DM's surfaces — a bestiary hit is a stat block a player has no screen to
 *   open, and a note hit is a row this screen already shows in full. A control
 *   whose results mostly lead nowhere is the same lie as a stubbed field. It
 *   earns its place the day a player has somewhere for a hit to point.
 * - **Everything the DM's Chronicle already leaves out** — the summary, the
 *   quote, the loot, the XP, the *Recap session N* button. None of them is a
 *   column anywhere in the product.
 */
export function PlayerChronicleScreen() {
  const { campaignId } = useParams({ from: "/play/campaigns/$campaignId" });
  const [readAloud, setReadAloud] = useState(false);
  /**
   * Which night is open — `undefined` until somebody chooses, which resolves to
   * the newest, and `null` for "closed on purpose" so that shutting the newest
   * card does not silently reopen it. The DM's screen keeps the same three
   * states for the same reason.
   */
  const [openId, setOpenId] = useState<SessionId | null | undefined>(undefined);

  const load = useCallback(
    (client: TavernsClient) => loadPlayerChronicle(campaignId)(client),
    [campaignId],
  );
  const [resource, reload] = useApiResource(load);

  const view = resource.state === "ready" ? resource.value : undefined;
  const sessions = view?.sessions ?? [];
  const newest = sessions[0];
  const open = openId === undefined ? newest?.id : openId;
  const earliest = sessions[sessions.length - 1];

  return (
    <AppShell
      campaignName={view?.campaign.name}
      topBar={
        <TopBar
          title="Chronicle"
          subtitle={
            view === undefined
              ? undefined
              : `${String(sessions.length)} ${sessions.length === 1 ? "night" : "nights"} your DM has shared`
          }
        >
          <Toggle size="sm" pressed={readAloud} onPressedChange={setReadAloud}>
            <Icon name="megaphone" size={13} />
            Read aloud
          </Toggle>
        </TopBar>
      }
    >
      {resource.state === "loading" && <Loading label="Opening the chronicle…" />}
      {resource.state === "failed" && (
        <div className="max-w-3xl">
          <FailureNotice failure={resource.failure} onRetry={reload} />
        </div>
      )}

      {view !== undefined && sessions.length === 0 && (
        // What somebody who joined last night sees, and the ordinary outcome
        // rather than an error: sessions start `dm`, so a table with a record
        // ten nights long has nothing here until its DM shares one. It names the
        // person who decides, because otherwise the page reads as broken.
        <div className="max-w-3xl">
          <EmptyState icon="scroll-text" title="No nights shared yet">
            Your DM decides which nights the table can read back. When they share one, it appears
            here — the beats they kept, the text they read out, and the fights you were in. Nothing
            is missing from <span className="text-heading">{view.campaign.name}</span>; it just has
            not been shared with you.
          </EmptyState>
        </div>
      )}

      {view !== undefined && sessions.length > 0 && (
        // No aside, so the spine is a measure rather than a column beside one.
        // `@4xl` is the same threshold the DM's screen docks its aside at, and
        // above it the width is roughly the column that leaves — a record is
        // read, so it is bounded either way rather than run to the window.
        <div className="mx-auto w-full max-w-measure @4xl:mx-0 @4xl:max-w-4xl">
          {sessions.map((session) => (
            <SessionEntry
              key={session.id}
              session={session}
              latest={session.id === newest?.id}
              open={session.id === open}
              readAloud={readAloud}
              onToggle={() => setOpenId((current) => (current === session.id ? null : session.id))}
            >
              <PlayerRecapBody
                campaignId={campaignId}
                sessionId={session.id}
                readAloud={readAloud}
              />
            </SessionEntry>
          ))}

          {/* The spine's terminus. It says where *this reader's* record begins,
              which is not the same claim the DM's makes: a gap here may be a
              night that was never played or one that was not shared, and this
              screen cannot tell them apart. So it says what it knows. */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4">
            <div className="flex w-4 justify-center">
              <Icon name="flag" size={13} className="mt-1 text-faint" />
            </div>
            <p className="pt-0.5 text-label leading-body text-faint">
              {earliest !== undefined && earliest.number > 1
                ? `The earliest night shared with you is session ${String(earliest.number)}.`
                : "That is everything shared with you."}
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}
