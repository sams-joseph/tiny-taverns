import { RegistryProvider } from "@effect/atom-react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignId } from "@taverns/api";
import { Schema } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiAtom, useApiAtom } from "./atoms";
import { reads } from "./keys";
import { useMutation } from "./mutation";

/**
 * **The seam itself: a read that names a resource, and a write that names the
 * same one.**
 *
 * `campaign/invalidation.test.tsx` pins the *graph* — which write moves which
 * card, screen by screen. This pins the *mechanism* underneath it, which is one
 * sentence and is the thing most able to break silently:
 *
 * > `apiAtom`'s `Atom.withReactivity` and `submit`'s invalidation resolve the
 * > **same** `Reactivity` service — `Atom.runtime` memoises `Reactivity.layer`
 * > in `Atom.defaultMemoMap`, and `AtomHttpApi.Service` builds `Api.runtime`
 * > from that same default factory.
 *
 * If a bump ever gave the two halves different instances, nothing would fail to
 * compile and no screen would error: writes would simply stop refreshing reads,
 * everywhere at once, and the symptom would be a stale card somebody notices
 * days later. So it is asserted rather than argued.
 *
 * Three properties, and the second and third are what make the first safe to
 * rely on: a write refreshes what it names, does **not** refresh what it did
 * not name, and refreshes nothing at all when the server refuses it.
 */

const campaignId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0de");
const otherId = Schema.decodeSync(CampaignId)("2b1f2a1e-0000-4000-8000-00000000c0df");

const notesOf = (id: CampaignId) => `/campaigns/${id}/notes`;

/** What each read answers next, and every request made. */
const paths: Array<string> = [];
const answers = new Map<string, { readonly status: number; readonly body: unknown }>();

const note = (title: string) => ({
  id: "2b1f2a1e-0000-4000-8000-000000000801",
  campaignId,
  title,
  body: "",
  kind: "note",
  attachedTo: null,
  visibility: "dm",
  origin: "authored",
  assistantTurnId: null,
  createdAt: "2026-08-04T13:03:28.070Z",
  updatedAt: "2026-08-04T13:03:28.070Z",
});

/**
 * One permanent dispatcher, re-aimed per test — the `Context.Reference` rule
 * `api/client.test.ts` records, which applies to the atom client too because it
 * goes through the same `FetchHttpClient`.
 */
vi.stubGlobal("fetch", (url: string | URL, init: RequestInit | undefined) => {
  const { pathname } = new URL(String(url));
  paths.push(`${init?.method ?? "GET"} ${pathname}`);
  const answer = answers.get(`${init?.method ?? "GET"} ${pathname}`) ?? {
    status: 404,
    body: { _tag: "NotFound", resource: "note", id: "x" },
  };
  return Promise.resolve(
    new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    }),
  );
});

beforeEach(() => {
  paths.length = 0;
  answers.clear();
  answers.set(`GET ${notesOf(campaignId)}`, {
    status: 200,
    body: { items: [note("As it was")], nextCursor: null },
  });
  answers.set(`GET ${notesOf(otherId)}`, {
    status: 200,
    body: { items: [note("Another table")], nextCursor: null },
  });
});

/** Two reads on two campaigns, and one write the test aims at either of them. */
const notesAtom = (id: CampaignId) =>
  apiAtom(
    (client) => client.notes.list({ params: { campaignId: id }, query: { limit: 200 } }),
    [reads.notes(id)],
  );

const thisTable = notesAtom(campaignId);
const otherTable = notesAtom(otherId);

function Probe({ writeTo }: { readonly writeTo: CampaignId }) {
  const [mine] = useApiAtom(thisTable);
  const [theirs] = useApiAtom(otherTable);
  const { submit } = useMutation();

  return (
    <>
      <span data-testid="mine">
        {mine.state === "ready" ? mine.value.items.map((row) => row.title).join() : mine.state}
      </span>
      <span data-testid="theirs">
        {theirs.state === "ready"
          ? theirs.value.items.map((row) => row.title).join()
          : theirs.state}
      </span>
      <button
        onClick={() =>
          void submit(
            (client) =>
              client.notes.create({
                params: { campaignId: writeTo },
                payload: { title: "New", body: "", kind: "note", visibility: "dm" },
              }),
            [reads.notes(writeTo)],
          )
        }
      >
        Write
      </button>
    </>
  );
}

const mount = async (writeTo: CampaignId) => {
  render(
    <RegistryProvider>
      <Probe writeTo={writeTo} />
    </RegistryProvider>,
  );
  await screen.findByText("As it was");
  await screen.findByText("Another table");
};

const readsOf = (path: string): number => paths.filter((entry) => entry === `GET ${path}`).length;

describe("a write, and the reads that named what it changed", () => {
  it("re-reads the atom that named the same resource", async () => {
    answers.set(`POST ${notesOf(campaignId)}`, { status: 200, body: note("New") });
    await mount(campaignId);
    answers.set(`GET ${notesOf(campaignId)}`, {
      status: 200,
      body: { items: [note("As it was"), note("New")], nextCursor: null },
    });

    paths.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "Write" }));

    await waitFor(() => expect(screen.getByTestId("mine")).toHaveTextContent("New"));
    expect(readsOf(notesOf(campaignId))).toBe(1);
  });

  /**
   * The half that makes the narrowing worth having. A key carries the id, so a
   * write at one table does not re-read another's — which is what a scheme
   * keyed only on the table name would have got wrong, and would have got wrong
   * invisibly, by being merely slower.
   */
  it("leaves an atom that named a different campaign alone", async () => {
    answers.set(`POST ${notesOf(otherId)}`, { status: 200, body: note("New") });
    await mount(otherId);

    paths.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "Write" }));

    await waitFor(() => expect(readsOf(notesOf(otherId))).toBe(1));
    expect(readsOf(notesOf(campaignId))).toBe(0);
  });

  it("refreshes nothing when the server refuses the write", async () => {
    // No `POST` answer, so the dispatcher's 404 is what comes back.
    await mount(campaignId);

    paths.length = 0;
    await userEvent.click(screen.getByRole("button", { name: "Write" }));

    await waitFor(() => expect(paths).toEqual([`POST ${notesOf(campaignId)}`]));
  });
});
