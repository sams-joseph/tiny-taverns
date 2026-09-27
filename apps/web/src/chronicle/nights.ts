import type { Session, SessionId } from "@taverns/api";
import { useCallback, useEffect, useState } from "react";
import { monthOf } from "./format";

/**
 * The element id a night's card carries, which *Jump to* and `?session=`
 * scroll to. By number, as the drawing spells it (`#session-12`): a
 * campaign's numbers are its own and unique, and they read in a URL.
 */
export const nightAnchor = (session: Session): string => `session-${String(session.number)}`;

/**
 * Which nights are open, and a way to open one and bring it into view.
 *
 * **Any number may be open at once**, as the drawing's cards are — each a
 * toggle of its own, and *Expand all* opens every one. A card opens on the
 * newest night, or on the night `?session=` names when a link brought the
 * reader here (the Encounters preview's *View log*); then that night alone is
 * open, so no card above it grows while it is being scrolled to. A name the
 * list does not hold — a night this reader may not see — opens the newest, as
 * if nothing had been named.
 *
 * `sessions` may still be loading: the DM's header, which holds *Expand all*,
 * is drawn by the campaign's frame before the record has answered. Until the
 * reader presses anything, what is open is that default, worked out from
 * whatever list is there, rather than a set captured before the list arrived.
 *
 * The scroll is instant rather than smooth: it is where the page opened, or the
 * answer to a press, and either way the reader asked for that night.
 */
export function useOpenNights(
  sessions: ReadonlyArray<Session> | undefined,
  target: SessionId | undefined,
): OpenNights {
  const named = sessions?.find((session) => session.id === target)?.id;
  const first = named ?? sessions?.[0]?.id;
  // `undefined` until the reader first presses something: the default above.
  const [pressed, setPressed] = useState<ReadonlySet<SessionId> | undefined>();
  const open: ReadonlySet<SessionId> = pressed ?? new Set(first === undefined ? [] : [first]);
  const [scrollTo, setScrollTo] = useState<SessionId | undefined>();
  const landed = useCallback(() => setScrollTo(undefined), []);

  const change = (next: (current: ReadonlySet<SessionId>) => ReadonlySet<SessionId>) =>
    setPressed((current) => next(current ?? new Set(first === undefined ? [] : [first])));

  // On arrival, and again whenever the address names another night while the
  // page is up (back and forward walk `?session=` without a remount).
  useEffect(() => {
    if (named === undefined) return;
    setPressed((current) => (current === undefined ? current : new Set(current).add(named)));
    setScrollTo(named);
  }, [named]);

  const every = sessions ?? [];
  const allOpen = every.length > 0 && every.every((session) => open.has(session.id));

  return {
    isOpen: (id) => open.has(id),
    toggle: (id) =>
      change((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    jump: (id) => {
      change((current) => new Set(current).add(id));
      setScrollTo(id);
    },
    allOpen,
    scrollTo,
    landed,
    // Collapsing leaves nothing open, not the newest: the reader asked for
    // every card shut, and a default reopening one would undo the press.
    toggleAll: () => setPressed(allOpen ? new Set() : new Set(every.map((session) => session.id))),
  };
}

export interface OpenNights {
  readonly isOpen: (id: SessionId) => boolean;
  readonly toggle: (id: SessionId) => void;
  readonly jump: (id: SessionId) => void;
  /** The night waiting to be brought into view, once its card is drawn (`useLanding`). */
  readonly scrollTo: SessionId | undefined;
  readonly landed: () => void;
  /** Whether every night on the list is open — *Expand all* reads *Collapse all*. */
  readonly allOpen: boolean;
  readonly toggleAll: () => void;
}

/**
 * Brings the night a jump or a link named into view — **called by the
 * component that draws the cards**, not by `useOpenNights`. The open set lives
 * above the campaign's frame, which draws its body only once every read has
 * answered; a scroll run from up there can find the list before the cards are
 * in the document, and a scroll to nothing is a link that lands nowhere.
 */
export function useLanding(nights: OpenNights, sessions: ReadonlyArray<Session>): void {
  const { scrollTo, landed } = nights;
  useEffect(() => {
    if (scrollTo === undefined) return;
    const session = sessions.find((row) => row.id === scrollTo);
    const card = session === undefined ? null : document.getElementById(nightAnchor(session));
    // jsdom lays nothing out and has no `scrollIntoView` at all.
    if (card !== null && typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ block: "start" });
    }
    landed();
  }, [scrollTo, sessions, landed]);
}

/**
 * The header's line: *"12 sessions · since March 2026"*, from the month the
 * earliest night on the list was played. The list is newest first, so that is
 * the last one that has started.
 */
export const summaryLine = (sessions: ReadonlyArray<Session>, qualifier = ""): string => {
  const count = `${String(sessions.length)} ${sessions.length === 1 ? "session" : "sessions"}${qualifier}`;
  const earliest = [...sessions].reverse().find((session) => session.startedAt !== null)?.startedAt;
  return earliest === undefined || earliest === null
    ? count
    : `${count} · since ${monthOf(earliest)}`;
};
