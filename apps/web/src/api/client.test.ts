import { CampaignId, NoteId } from "@taverns/api";
import { Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import { runApi } from "./client";

/**
 * The derived client, exercised in the browser build.
 *
 * `fetch` is stubbed rather than the client: the point is to check what the
 * client puts on the wire and what it makes of the answer, both driven entirely
 * by the shared `TavernsApi` declaration. `apps/server/test/api.test.ts` runs
 * the same client against a real server; this covers the half that ships to the
 * browser — bundled by Vite, no Node.
 */
interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

const calls: Array<Call> = [];
let answer: { body: unknown; status: number } = { body: {}, status: 200 };

/**
 * One permanent stub, re-aimed per test.
 *
 * `FetchHttpClient.Fetch` is a `Context.Reference` whose default is
 * `() => globalThis.fetch`, and `Context` memoises a reference's default value
 * the first time it is read (`Context.ts`, `~effect/Context/defaultValue`).
 * Whatever `fetch` is installed at that moment is the one every later request
 * uses — a per-test `vi.stubGlobal` silently keeps serving the *first* test's
 * responses, with no error to notice. Hence a single stable dispatcher.
 */
vi.stubGlobal("fetch", (url: string | URL, init: RequestInit) => {
  calls.push({ url: String(url), init });
  return Promise.resolve(
    new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    }),
  );
});

const respondWith = (body: unknown, status = 200): ReadonlyArray<Call> => {
  answer = { body, status };
  calls.length = 0;
  return calls;
};

const headerOf = (call: Call, name: string): string | undefined =>
  (call.init.headers as Record<string, string> | undefined)?.[name];

const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const noteId = Schema.decodeSync(NoteId)("2b1f2a1e-0000-4000-8000-000000000001");

const noteJson = {
  id: noteId,
  campaignId,
  title: "The crate",
  body: "Decide what the crate contains",
  kind: "note",
  visibility: "dm",
  origin: "authored",
  assistantTurnId: null,
  createdAt: "2026-08-04T13:03:28.070Z",
  updatedAt: "2026-08-04T13:03:28.070Z",
};

describe("the derived client", () => {
  it("decodes /health into the shared HealthStatus", async () => {
    respondWith({ status: "ok", uptime: 12.5 });

    const health = await runApi((client) => client.health.check());

    expect(health.status).toBe("ok");
    expect(health.uptime).toBe(12.5);
  });

  it("sends the method, path, payload and bearer the declaration describes", async () => {
    const calls = respondWith(noteJson);

    await runApi(
      (client) =>
        client.notes.create({
          params: { campaignId },
          payload: { title: "The crate", body: "Decide what the crate contains" },
        }),
      "a-dm-token",
    );

    const call = calls[0]!;
    expect(call.init.method).toBe("POST");
    expect(new URL(call.url).pathname).toBe(`/campaigns/${campaignId}/notes`);
    expect(headerOf(call, "authorization")).toBe("Bearer a-dm-token");
    expect(JSON.parse(new TextDecoder().decode(call.init.body as Uint8Array))).toEqual({
      title: "The crate",
      body: "Decide what the crate contains",
    });
  });

  it("omits the bearer header when there is no token", async () => {
    const calls = respondWith({ status: "ok", uptime: 1 });

    await runApi((client) => client.health.check());

    expect(headerOf(calls[0]!, "authorization")).toBeUndefined();
  });

  it("decodes timestamps and provenance rather than handing back raw JSON", async () => {
    respondWith(noteJson);

    const note = await runApi((client) =>
      client.notes.findById({ params: { campaignId, noteId } }),
    );

    // Decoded, not passed through: an ISO string became a DateTime, and the
    // provenance fields arrived typed.
    expect(note.createdAt.epochMilliseconds).toBe(Date.parse(noteJson.createdAt));
    expect(note.origin).toBe("authored");
    expect(note.visibility).toBe("dm");
    expect(note.assistantTurnId).toBeNull();
  });

  it("surfaces a declared error as that error, not as a raw response", async () => {
    respondWith({ _tag: "NotFound", resource: "note", id: noteId }, 404);

    await expect(
      runApi((client) => client.notes.findById({ params: { campaignId, noteId } })),
    ).rejects.toMatchObject({ _tag: "NotFound", resource: "note" });
  });
});
