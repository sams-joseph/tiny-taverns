import type { Npc, NpcAttitude, NpcId, NpcPrep, NpcStatus, Session, SessionId } from "@taverns/api";
import type { Badge } from "@taverns/ui";
import type { ComponentProps } from "react";
import { npcMatches } from "./persona";

/**
 * The DM's prep for an NPC as the Cast draws it — the card's badges and lines,
 * the drawer's toggles, the header's counts and the filter row's pills — in
 * one place, so the card, the drawer and the filters cannot disagree about a
 * word or a colour.
 *
 * Nothing here guesses. An attitude or status that is `null` draws no badge,
 * and a `null` *where* draws no line; only *first met* speaks for its `null`,
 * because "Not met yet" is what the contract says it means.
 */

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

/** *Toward the party*, in the drawn order, each with its card badge. */
export const ATTITUDES: ReadonlyArray<{
  readonly value: NpcAttitude;
  readonly label: string;
  readonly badge: BadgeVariant;
}> = [
  { value: "friendly", label: "Friendly", badge: "success" },
  { value: "indifferent", label: "Indifferent", badge: "outline" },
  { value: "hostile", label: "Hostile", badge: "destructive" },
];

/**
 * *Status*, in the drawn order. `alive` has no badge: it is the ordinary
 * state, and the card marks only what is not.
 */
export const STATUSES: ReadonlyArray<{
  readonly value: NpcStatus;
  readonly label: string;
  readonly badge: BadgeVariant | undefined;
}> = [
  { value: "alive", label: "Alive", badge: undefined },
  { value: "dead", label: "Dead", badge: "destructive" },
  { value: "captive", label: "Captive", badge: "info" },
  { value: "unknown", label: "Unknown", badge: "secondary" },
];

export const attitudeOf = (value: NpcAttitude) =>
  ATTITUDES.find((attitude) => attitude.value === value)!;

export const statusOf = (value: NpcStatus) => STATUSES.find((status) => status.value === value)!;

/** A night as *First met* offers it. */
export const nightLabel = (night: Session): string => `Session ${String(night.number)}`;

/**
 * The met line: "First met in session 8", or "Not met yet". A night the list
 * does not have — deleted since, and about to be cleared — draws no line.
 */
export const metLine = (
  metSessionId: SessionId | null,
  nights: ReadonlyArray<Session>,
): string | undefined => {
  if (metSessionId === null) return "Not met yet";
  const night = nights.find((row) => row.id === metSessionId);
  return night === undefined ? undefined : `First met in session ${String(night.number)}`;
};

/** The first pill group: always one lit. */
export type MetFilter = "everyone" | "met" | "unmet";

export const MET_PILLS: ReadonlyArray<readonly [MetFilter, string]> = [
  ["everyone", "Everyone"],
  ["met", "Met"],
  ["unmet", "Not met yet"],
];

/** What the filter row asks: the search, one met pill, and at most one attitude. */
export interface CastFilter {
  readonly text: string;
  readonly met: MetFilter;
  readonly attitude: NpcAttitude | null;
}

/** Each NPC's prep by id. One the list does not have yet has nothing set. */
export const prepById = (prep: ReadonlyArray<NpcPrep>): ReadonlyMap<NpcId, NpcPrep> =>
  new Map(prep.map((row) => [row.npcId, row]));

/** The search, the met pill and the attitude pill, ANDed. */
export const castMatches = (filter: CastFilter, npc: Npc, prep: NpcPrep | undefined): boolean => {
  const met = (prep?.metSessionId ?? null) !== null;
  if (filter.met === "met" && !met) return false;
  if (filter.met === "unmet" && met) return false;
  if (filter.attitude !== null && prep?.attitude !== filter.attitude) return false;
  return npcMatches(filter.text, npc, prep?.whereabouts ?? null);
};

/** The header's line over the whole live cast, whatever the filter shows. */
export const castSummary = (
  npcs: ReadonlyArray<Npc>,
  prep: ReadonlyMap<NpcId, NpcPrep>,
): string => {
  if (npcs.length === 0) return "No NPCs yet";
  const met = npcs.filter((npc) => (prep.get(npc.id)?.metSessionId ?? null) !== null).length;
  const hostile = npcs.filter((npc) => prep.get(npc.id)?.attitude === "hostile").length;
  const count = `${String(npcs.length)} ${npcs.length === 1 ? "NPC" : "NPCs"}`;
  return `${count} · ${String(met)} met · ${String(hostile)} hostile`;
};
