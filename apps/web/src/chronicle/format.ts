import { DateTime } from "effect";

/**
 * Dates, written the way the delivery writes them.
 *
 * `chronicle-data.js` spells a night *"2 August 2026"*, so that is what this
 * produces — spelled out rather than left to `toLocaleDateString`, which would
 * put a different string on a DM's screen than on a test's and hand the record
 * an American month order half the time. Same reasoning as `SessionCard`'s
 * `clockOf`, which writes its own clock rather than reaching for `Intl`.
 *
 * UTC throughout, because every timestamp on the wire is
 * `Schema.DateTimeUtcFromString` and a night that starts at 19:00 local should
 * not read as the next day.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `2 August 2026`. */
export const dayOf = (at: DateTime.Utc): string => {
  const date = DateTime.toDateUtc(at);
  return `${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ""} ${String(date.getUTCFullYear())}`;
};

/** `21:04` — the same clock `campaign/SessionCard.tsx` writes. */
export const clockOf = (at: DateTime.Utc): string => {
  const date = DateTime.toDateUtc(at);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
};

/**
 * How long the night ran, from the two columns that already answer it.
 *
 * `Recap.ts` refuses a duration field for exactly this reason — *"a third number
 * that must agree with two others is a second answer waiting to be wrong"* — so
 * it is computed where it is rendered and stored nowhere.
 */
export const spanOf = (startedAt: DateTime.Utc | null, endedAt: DateTime.Utc | null): string => {
  if (startedAt === null) return "Not played yet";
  if (endedAt === null) return `Started ${clockOf(startedAt)}, still open`;
  const minutes = Math.max(
    0,
    Math.round(DateTime.toEpochMillis(endedAt) - DateTime.toEpochMillis(startedAt)) / 60_000,
  );
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  const length =
    hours === 0
      ? `${String(rest)} min`
      : rest === 0
        ? `${String(hours)} hr`
        : `${String(hours)} hr ${String(rest)} min`;
  return `${clockOf(startedAt)}–${clockOf(endedAt)} · ${length}`;
};
