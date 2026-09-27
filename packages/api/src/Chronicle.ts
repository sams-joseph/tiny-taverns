import { Schema } from "effect";
import { Beat } from "./Beat.js";
import { EncounterRun } from "./EncounterRun.js";
import { Session } from "./Session.js";

/**
 * One night of the campaign's record, as the Chronicle lists it: the night,
 * what was played on it and the DM's beats — every night at once, so a list
 * can open them all without one recap read per card.
 *
 * **A narrower cut of `SessionRecap`, not a second account of a night.**
 * `repo/Recap.ts` reads the session, its runs and its beats through one
 * function for both, so a night here is always the same night its recap
 * describes (`chronicle.test.ts` compares them). What a recap adds is the
 * per-night detail a list does not draw: the initiative lists, the checks and
 * scenes, the carry-over links, the ticked prep and the read-alouds. Those
 * stay behind `recap.read`, one night at a time.
 *
 * `runs` are oldest first — the order the night was played in — and each is
 * the whole `EncounterRun`, so a client tells one by its kind (`mode`) and
 * names it by `encounterName`. `beats` are verbatim, oldest first, each with
 * its own `visibility`, which is how the DM's copy tells a shared moment from
 * one kept to themselves.
 *
 * The creator's: `GET /campaigns/:c/chronicle` takes the creator proof. A
 * field that only the DM may read belongs on this type, never on
 * `PlayerChronicleNight`.
 */
export class ChronicleNight extends Schema.Class<ChronicleNight>("ChronicleNight")({
  session: Session,
  /** Oldest first. */
  runs: Schema.Array(EncounterRun),
  /** Every beat of the night, verbatim, oldest first. */
  beats: Schema.Array(Beat),
}) {}

/**
 * One night of the record, told to somebody who played in it.
 *
 * **A distinct type on a distinct path** (`GET /campaigns/:c/chronicle/player`),
 * for the reason `PlayerSessionRecap` is one: a field added to the creator's
 * night does not reach a player until somebody adds it here on purpose.
 *
 * Today its fields are the creator's types, narrowed in SQL rather than by
 * shape, exactly as the player's recap narrows them:
 *
 * - only the nights the DM shared, and on them only the shared runs and beats
 *   (`repo/visibility.ts`); an unshared night is not listed at all;
 * - a run names its encounter only when this player may read that encounter
 *   (Shared and Ready), and otherwise has a `null` `encounterId` and the kind
 *   of scene for a name, "A fight" or "A conversation" (`runColumns`).
 */
export class PlayerChronicleNight extends Schema.Class<PlayerChronicleNight>(
  "PlayerChronicleNight",
)({
  session: Session,
  /** Oldest first; the shared ones. */
  runs: Schema.Array(EncounterRun),
  /** The shared beats, verbatim, oldest first. */
  beats: Schema.Array(Beat),
}) {}
