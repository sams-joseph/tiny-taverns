import {
  CampaignCharacterId,
  CampaignId,
  CharacterId,
  EncounterId,
  EncounterRunId,
  NoteId,
  NpcId,
  SessionId,
  SharedWorldId,
} from "@taverns/api";
import { Schema } from "effect";

/**
 * The route files' decoders for ids in a path or a query string. The `-` keeps
 * the router's generator from reading this file as a route.
 *
 * ### A bad id is a bad link, not a crash
 *
 * The ids are branded UUIDs. `params.parse` decodes each one through its own
 * schema and returns `false` for anything it did not mint, which makes the
 * router **reject that route candidate and keep matching** — so a truncated id
 * falls back to the nearest ancestor that was still legible rather than
 * throwing during render or landing on a not-found page. That is the whole of
 * how `/campaigns/<bad>` reaches the campaign list and
 * `/campaigns/<good>/sessions/<bad>/runs/<good>` reaches the campaign: each
 * level that can still be read has a `$` splat child pointing at its own
 * screen, and matching backtracks into it. `routes.test.ts` pins every case.
 *
 * Returning `false` rather than throwing matters: a throw becomes a
 * `PathParamError` on the match, which is an error boundary and a rendered
 * apology. A refusal is a link that was never real.
 */

/**
 * An id we did not mint is a bad link, not a crash.
 *
 * Wraps a branded schema into the decoded value, or `undefined` for the
 * callers below to turn into `false` (a path) or no choice (a query string).
 */
const decoder = <A>(schema: Schema.Codec<A, string>) => {
  const decode = Schema.decodeSync(schema);
  return (raw: string | undefined): A | undefined => {
    if (raw === undefined || raw === "") return undefined;
    try {
      return decode(raw);
    } catch {
      return undefined;
    }
  };
};

/** `params.parse` for one path id: the decoded id, or `false` to refuse the candidate. */
const pathId = <K extends string, A>(key: K, schema: Schema.Codec<A, string>) => {
  const decode = decoder(schema);
  return {
    parse: (params: Record<K, string>): Record<K, A> | false => {
      const decoded = decode(params[key]);
      return decoded === undefined ? false : ({ [key]: decoded } as Record<K, A>);
    },
  };
};

/** `validateSearch` for one optional query id: a bad or missing one is no choice. */
const searchId = <K extends string, A>(key: K, schema: Schema.Codec<A, string>) => {
  const decode = decoder(schema);
  return (search: Record<string, unknown>): Partial<Record<K, A>> => {
    const raw = search[key];
    const decoded = decode(typeof raw === "string" ? raw : undefined);
    return decoded === undefined ? {} : ({ [key]: decoded } as Partial<Record<K, A>>);
  };
};

export const campaignIdParam = pathId("campaignId", CampaignId);
export const worldIdParam = pathId("worldId", SharedWorldId);
export const characterIdParam = pathId("characterId", CharacterId);
export const seatIdParam = pathId("seatId", CampaignCharacterId);
export const encounterIdParam = pathId("encounterId", EncounterId);
export const npcIdParam = pathId("npcId", NpcId);

const asSessionId = decoder(SessionId);
const asRunId = decoder(EncounterRunId);

/** The fight's two ids below its campaign; either one unreadable refuses both. */
export const runParams = {
  parse: ({
    sessionId,
    runId,
  }: {
    readonly sessionId: string;
    readonly runId: string;
  }): { sessionId: SessionId; runId: EncounterRunId } | false => {
    const session = asSessionId(sessionId);
    const run = asRunId(runId);
    return session === undefined || run === undefined ? false : { sessionId: session, runId: run };
  },
};

/**
 * An invitation token, as it may appear in a link.
 *
 * 32 bytes of `randomBytes` in base64url, whose alphabet is exactly this — so a
 * link that lost characters to a chat client's line wrapping is refused here
 * rather than sent to the server to be refused there. The length is not
 * checked: the server's answer is the authority on whether a token is real, and
 * a rule restated in two places is a rule that can disagree with itself.
 */
export const tokenParam = {
  parse: ({ token }: { readonly token: string }): { token: string } | false =>
    /^[A-Za-z0-9_-]+$/.test(token) ? { token } : false,
};

export const encounterSearch = searchId("encounter", EncounterId);
export const noteSearch = searchId("note", NoteId);
export const npcSearch = searchId("npc", NpcId);
export const sessionSearch = searchId("session", SessionId);
