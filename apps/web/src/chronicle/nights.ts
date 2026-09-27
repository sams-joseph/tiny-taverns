import type { Session, SessionId } from "@taverns/api";
import { useEffect, useState } from "react";
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
 * toggle of its own, and the set is what *Expand all* will fill. A card opens
 * on the newest night, or on the night `?session=` names when a link brought
 * the reader here (the Encounters preview's *View log*); then that night alone
 * is open, so no card above it grows while it is being scrolled to. A name the
 * list does not hold — a night this reader may not see — opens the newest, as
 * if nothing had been named.
 *
 * The scroll is instant rather than smooth: it is where the page opened, or the
 * answer to a press, and either way the reader asked for that night.
 */
export function useOpenNights(
  sessions: ReadonlyArray<Session>,
  target: SessionId | undefined,
): {
  readonly isOpen: (id: SessionId) => boolean;
  readonly toggle: (id: SessionId) => void;
  readonly jump: (id: SessionId) => void;
} {
  const named = sessions.find((session) => session.id === target)?.id;
  const [open, setOpen] = useState<ReadonlySet<SessionId>>(() => {
    const first = named ?? sessions[0]?.id;
    return new Set(first === undefined ? [] : [first]);
  });
  const [scrollTo, setScrollTo] = useState<SessionId | undefined>();

  // On arrival, and again whenever the address names another night while the
  // page is up (back and forward walk `?session=` without a remount).
  useEffect(() => {
    if (named === undefined) return;
    setOpen((current) => new Set(current).add(named));
    setScrollTo(named);
  }, [named]);

  useEffect(() => {
    if (scrollTo === undefined) return;
    const session = sessions.find((row) => row.id === scrollTo);
    const card = session === undefined ? null : document.getElementById(nightAnchor(session));
    // jsdom lays nothing out and has no `scrollIntoView` at all.
    if (card !== null && typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ block: "start" });
    }
    setScrollTo(undefined);
  }, [scrollTo, sessions]);

  return {
    isOpen: (id) => open.has(id),
    toggle: (id) =>
      setOpen((current) => {
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    jump: (id) => {
      setOpen((current) => new Set(current).add(id));
      setScrollTo(id);
    },
  };
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
