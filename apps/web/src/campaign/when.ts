import { DateTime } from "effect";
import { useEffect, useState } from "react";
import { dayOf } from "../chronicle/format";

/**
 * How long ago something happened, the way the Overview's redesign writes it:
 * *"Yesterday"*, *"3 days ago"*, *"Last week"*.
 *
 * Spelled out rather than left to `Intl.RelativeTimeFormat` for the reason
 * `chronicle/format.ts` gives for its dates: the words on a DM's screen and in a
 * test are then the same words. Past a month the count stops meaning much and
 * the date itself is what a reader wants, so it falls back to `dayOf`.
 *
 * `now` is an argument so the function is pure; a component passes `useNow()`.
 */
export const agoOf = (at: DateTime.Utc, now: number): string => {
  const minutes = Math.floor(Math.max(0, now - DateTime.toEpochMillis(at)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${String(days)} days ago`;
  if (days < 14) return "Last week";
  if (days < 35) return `${String(Math.floor(days / 7))} weeks ago`;
  return dayOf(at);
};

/**
 * The time, re-read once a minute, so a line saying *"started 48 min ago"* keeps
 * saying something true while the page stays open at a table.
 */
export const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};
