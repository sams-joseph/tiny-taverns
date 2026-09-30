import { describe, expect } from "@effect/vitest";
import {
  Actor,
  type AssistantThreadId,
  type AssistantTurnId,
  type CampaignId,
  CurrentActor,
  type EncounterCreate,
  type EncounterId,
  type HobEvent,
  TavernsApi,
} from "@taverns/api";
import { Context, Effect, Layer, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Accounts } from "../src/Accounts.js";
import { applicationOver, servicesOver } from "../src/app.js";
import { Hob } from "../src/assistant/Hob.js";
import { Creatures } from "../src/repo/Creatures.js";
import { admittedTo, aGroupMemberAt, asDm } from "./support/actors.js";
import { migratedDatabase } from "./support/database.js";
import { type Round, scriptedModel, textChunks, toolCallChunks } from "./support/model.js";
import { testServer } from "./support/http.js";
import { describeLayer } from "./support/suite.js";

/**
 * **An encounter's kind is on the encounter; its DM prep — tactics, treasure,
 * and a skill challenge's or a hazard's numbers — is the creator's alone.**
 *
 * Over the real application and Postgres, through the client derived from the
 * contract: the form's create and update write the prep, the creator's prep
 * reads answer it, a player reading the shared encounter sees its kind and
 * nothing else, and Hob's accepted proposal writes the same fields through the
 * same create. The create also takes the roster, all or nothing, and the prep
 * carries the DM's Ready. Hob's model is scripted (`support/model.ts`).
 */

/** Hob's script, pushed round by round before each ask. */
const rounds: Array<Round> = [];
const chat = scriptedModel({ model: "scripted-local", maxTokens: 512, rounds });

const database = migratedDatabase("taverns_test_encounter_prep");
const services = servicesOver(
  database,
  undefined,
  Hob.layer({ model: "scripted-local" }).pipe(Layer.provide(chat.layer)),
);

const application = applicationOver(services, { quiet: true }).pipe(
  Layer.provideMerge(testServer),
  Layer.provideMerge(services),
  Layer.provideMerge(database),
);

const clientFor = (token: string) =>
  HttpApiClient.make(TavernsApi, {
    transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
  });

type Client = Effect.Success<ReturnType<typeof clientFor>>;

const as = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(Effect.orDie);

/** The same call, answering the failure's tag rather than dying on it. */
const attempt = <A, E>(token: string, call: (client: Client) => Effect.Effect<A, E>) =>
  Effect.flatMap(clientFor(token), call).pipe(
    Effect.map((value) => ({ ok: true as const, value })),
    Effect.catch((error: unknown) =>
      Effect.succeed({
        ok: false as const,
        tag:
          typeof error === "object" && error !== null && "_tag" in error
            ? String(error._tag)
            : "unknown",
      }),
    ),
  );

const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.orDie);

/** A request the derived client would refuse to encode, sent as it stands. */
const raw = (method: "post" | "patch", token: string, path: string, body: unknown) =>
  Effect.gen(function* () {
    const request =
      method === "post" ? HttpClientRequest.post(path) : HttpClientRequest.patch(path);
    const response = yield* HttpClient.execute(
      request.pipe(HttpClientRequest.bearerToken(token), HttpClientRequest.bodyJsonUnsafe(body)),
    );
    return response.status;
  }).pipe(Effect.orDie);

interface Person {
  readonly token: string;
  readonly actor: Actor;
}

const person = (name: string) =>
  Effect.gen(function* () {
    const issued = yield* run(Effect.flatMap(Accounts, (accounts) => accounts.issue(name)));
    return {
      token: issued.token,
      actor: new Actor({ accountId: issued.accountId, scope: { _tag: "account" } }),
    } satisfies Person;
  });

const encounterAt = (who: Person, campaignId: CampaignId, payload: EncounterCreate) =>
  as(who.token, (client) => client.encounters.create({ params: { campaignId }, payload }));

const prepOf = (who: Person, campaignId: CampaignId, encounterId: EncounterId) =>
  as(who.token, (client) => client.encounterPrep.find({ params: { campaignId, encounterId } }));

const WELL: EncounterCreate = {
  name: "The dry well",
  kind: "challenge",
  tactics: [
    "  Success: they find the buried cache.  ",
    "Each failure costs one day's water for the caravan.",
  ],
  treasure: "  A waterskin that never empties  ",
  challenge: {
    kind: "challenge",
    dc: 14,
    successes: 3,
    failures: 2,
    skills: ["Athletics", "Survival"],
  },
};

const STORM = {
  kind: "hazard",
  save: { ability: "CON", dc: 13 },
  onFail: "1 level of exhaustion",
  duration: "1d4 hours",
  skills: ["Survival", "Animal Handling"],
} as const;

const makeFixture = Effect.gen(function* () {
  const jo = yield* person("Jo");
  const ilse = yield* person("Ilse");
  const stranger = yield* person("Bo");
  const table = (yield* as(jo.token, (client) =>
    client.campaigns.create({ payload: { name: "The Salt Road", visibility: "shared" } }),
  )).id;
  return { jo, ilse, stranger, table };
});

class Fixture extends Context.Service<Fixture, Effect.Success<typeof makeFixture>>()(
  "encounter-prep.test/Fixture",
) {}

/** A shared, ready challenge with prep a player must never see, and who may not read it. */
const makeShown = Effect.gen(function* () {
  const { jo, ilse, table } = yield* Fixture;
  const shown = (yield* encounterAt(jo, table, {
    ...WELL,
    name: "Shown to the table",
    tactics: ["TACTIC-THE-CARAVAN-MASTER-LIES"],
    treasure: "TREASURE-UNDER-THE-FLOORBOARD",
    visibility: "shared",
    ready: true,
  })).id;
  const player = yield* run(admittedTo(table, ilse.actor, "Ilse"));
  const bystander = yield* run(aGroupMemberAt(table, "Wren"));
  return { shown, player, bystander };
});

class Shown extends Context.Service<Shown, Effect.Success<typeof makeShown>>()(
  "encounter-prep.test/Shown",
) {}

describeLayer(
  "encounter-prep",
  Layer.effect(Fixture)(makeFixture).pipe(Layer.provideMerge(application)),
  (it) => {
    describe("writing an encounter's kind and prep", () => {
      it.effect("writes them on create and reads them back through the creator's prep reads", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const well = yield* encounterAt(jo, table, WELL);
          expect(well.kind).toBe("challenge");

          const prep = yield* prepOf(jo, table, well.id);
          expect(prep.encounterId).toBe(well.id);
          // Trimmed on the way in, as the setting line and a description are.
          expect(prep.tactics).toEqual([
            "Success: they find the buried cache.",
            "Each failure costs one day's water for the caravan.",
          ]);
          expect(prep.treasure).toBe("A waterskin that never empties");
          expect(prep.challenge).toEqual(WELL.challenge);

          const listed = yield* as(jo.token, (client) =>
            client.encounterPrep.list({ params: { campaignId: table } }),
          );
          expect(listed.find((entry) => entry.encounterId === well.id)).toEqual(prep);
        }),
      );

      it.effect("makes an encounter with neither a fight with empty prep", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const plain = yield* encounterAt(jo, table, { name: "Wolves at the caravan" });
          expect(plain.kind).toBe("combat");
          const prep = yield* prepOf(jo, table, plain.id);
          expect(prep).toMatchObject({ tactics: [], treasure: null, challenge: null });

          // Every encounter the creator holds has one, in the order they were made.
          const listed = yield* as(jo.token, (client) =>
            client.encounterPrep.list({ params: { campaignId: table } }),
          );
          const encounters = yield* as(jo.token, (client) =>
            client.encounters.list({ params: { campaignId: table }, query: {} }),
          );
          expect(listed.map((entry) => entry.encounterId)).toEqual(
            encounters.items.map((entry) => entry.id),
          );
        }),
      );

      it.effect(
        "replaces the tactics, clears the treasure, and leaves what a patch does not name",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const well = yield* encounterAt(jo, table, { ...WELL, name: "The second well" });
            yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: well.id },
                payload: { tactics: ["Only the one line now."], treasure: null },
              }),
            );
            expect(yield* prepOf(jo, table, well.id)).toMatchObject({
              tactics: ["Only the one line now."],
              treasure: null,
              challenge: WELL.challenge,
            });

            // Sending the kind it already has keeps its challenge.
            yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: well.id },
                payload: { kind: "challenge", name: "The second well, renamed" },
              }),
            );
            expect((yield* prepOf(jo, table, well.id)).challenge).toEqual(WELL.challenge);

            yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: well.id },
                payload: { tactics: [] },
              }),
            );
            expect((yield* prepOf(jo, table, well.id)).tactics).toEqual([]);
          }),
      );

      it.effect(
        "clears a challenge the new kind does not take, and writes one sent with its kind",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const well = yield* encounterAt(jo, table, { ...WELL, name: "The third well" });

            const social = yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: well.id },
                payload: { kind: "social" },
              }),
            );
            expect(social.kind).toBe("social");
            const cleared = yield* prepOf(jo, table, well.id);
            expect(cleared.challenge).toBeNull();
            // Only the challenge belonged to the old kind; the rest of the prep stays.
            expect(cleared.tactics).toHaveLength(2);

            const hazard = yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: well.id },
                payload: { kind: "hazard", challenge: STORM },
              }),
            );
            expect(hazard.kind).toBe("hazard");
            expect((yield* prepOf(jo, table, well.id)).challenge).toEqual(STORM);

            yield* as(jo.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: well.id },
                payload: { challenge: null },
              }),
            );
            expect((yield* prepOf(jo, table, well.id)).challenge).toBeNull();
          }),
      );
    });

    describe("a challenge's shape follows the kind", () => {
      const post = (body: unknown) =>
        Effect.flatMap(Fixture, ({ jo, table }) =>
          raw("post", jo.token, `/campaigns/${table}/encounters`, body),
        );

      it.effect("refuses a challenge sent without its kind, or with another", () =>
        Effect.gen(function* () {
          expect(yield* post({ name: "No kind", challenge: WELL.challenge })).toBe(400);
          expect(
            yield* post({ name: "Wrong kind", kind: "hazard", challenge: WELL.challenge }),
          ).toBe(400);
          expect(yield* post({ name: "A fight", kind: "combat", challenge: STORM })).toBe(400);
        }),
      );

      it.effect("refuses a challenge missing what its kind needs, and a kind nobody named", () =>
        Effect.gen(function* () {
          const { save: _save, ...unsaved } = STORM;
          expect(yield* post({ name: "No save", kind: "hazard", challenge: unsaved })).toBe(400);
          const { dc: _dc, ...undc } = WELL.challenge as { readonly dc: number };
          expect(yield* post({ name: "No DC", kind: "challenge", challenge: undc })).toBe(400);
          expect(
            yield* post({
              name: "Too hard",
              kind: "challenge",
              challenge: { ...WELL.challenge, dc: 31 },
            }),
          ).toBe(400);
          expect(yield* post({ name: "A puzzle", kind: "puzzle" })).toBe(400);
        }),
      );

      it.effect("refuses blank or too many tactics and a blank treasure", () =>
        Effect.gen(function* () {
          expect(yield* post({ name: "Blank", tactics: ["   "] })).toBe(400);
          expect(
            yield* post({ name: "Many", tactics: Array.from({ length: 13 }, () => "A line") }),
          ).toBe(400);
          expect(yield* post({ name: "Long", tactics: ["x".repeat(301)] })).toBe(400);
          expect(yield* post({ name: "Nothing", treasure: "  " })).toBe(400);
        }),
      );

      it.effect("refuses a patch whose challenge does not name its kind", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const well = yield* encounterAt(jo, table, { ...WELL, name: "The fourth well" });
          const path = `/campaigns/${table}/encounters/${well.id}`;
          expect(yield* raw("patch", jo.token, path, { challenge: WELL.challenge })).toBe(400);
          expect(
            yield* raw("patch", jo.token, path, { kind: "hazard", challenge: WELL.challenge }),
          ).toBe(400);
          expect((yield* prepOf(jo, table, well.id)).challenge).toEqual(WELL.challenge);
        }),
      );
    });

    it.layer(Layer.effect(Shown)(makeShown))("the prep is the creator's alone", (it) => {
      it.effect("shows a player the shared encounter's kind, and nothing of its prep", () =>
        Effect.gen(function* () {
          const { ilse, table } = yield* Fixture;
          const { shown } = yield* Shown;
          const found = yield* as(ilse.token, (client) =>
            client.playerEncounters.find({ params: { campaignId: table, encounterId: shown } }),
          );
          const listed = yield* as(ilse.token, (client) =>
            client.playerEncounters.list({ params: { campaignId: table } }),
          );
          expect(found.kind).toBe("challenge");
          expect(listed.map((entry) => entry.id)).toContain(shown);
          for (const read of [found, listed]) {
            const text = JSON.stringify(read);
            expect(text).not.toContain("TACTIC-THE-CARAVAN-MASTER-LIES");
            expect(text).not.toContain("TREASURE-UNDER-THE-FLOORBOARD");
            expect(text).not.toContain("successes");
          }
        }),
      );

      it.effect(
        "answers a player, a Shared World member and a stranger NotFound on both prep reads",
        () =>
          Effect.gen(function* () {
            const { ilse, stranger, table } = yield* Fixture;
            const { shown, player, bystander } = yield* Shown;
            for (const who of [ilse, stranger]) {
              expect(
                yield* attempt(who.token, (client) =>
                  client.encounterPrep.find({ params: { campaignId: table, encounterId: shown } }),
                ),
              ).toEqual({ ok: false, tag: "NotFound" });
              expect(
                yield* attempt(who.token, (client) =>
                  client.encounterPrep.list({ params: { campaignId: table } }),
                ),
              ).toEqual({ ok: false, tag: "NotFound" });
            }
            // The proof the prep reads require: the player and the member cannot get one.
            for (const actor of [player, bystander]) {
              const proof = yield* Effect.result(asDm(actor, table));
              expect(proof._tag).toBe("Failure");
            }
          }),
      );

      it.effect("refuses a player's write of the prep as it refuses any encounter write", () =>
        Effect.gen(function* () {
          const { jo, ilse, table } = yield* Fixture;
          const { shown } = yield* Shown;
          expect(
            yield* attempt(ilse.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: shown },
                payload: { treasure: "Mine now", kind: "combat" },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          const prep = yield* prepOf(jo, table, shown);
          expect(prep.treasure).toBe("TREASURE-UNDER-THE-FLOORBOARD");
          expect(prep.challenge).toEqual(WELL.challenge);
        }),
      );
    });

    describe("Hob's accepted encounter", () => {
      const REPLY = textChunks("There you are.");

      /** Ask once, over exactly these rounds. */
      const converse = (text: string, script: ReadonlyArray<Round>, threadId?: AssistantThreadId) =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          rounds.push(...script);
          const events = yield* run(
            Effect.gen(function* () {
              const hob = yield* Hob;
              const stream = yield* hob.ask(table, { text, threadId });
              return Array.from(yield* Stream.runCollect(stream)) as ReadonlyArray<HobEvent>;
            }).pipe(Effect.provideService(CurrentActor, jo.actor)),
          );
          const began = events.find((event) => event.event === "began");
          if (began?.event !== "began") throw new Error("no began event");
          const proposed = events.find((event) => event.event === "proposal");
          return {
            events,
            began: began.data,
            proposal: proposed?.event === "proposal" ? proposed.data.proposal : undefined,
          };
        });

      /** Ask once; a tool call is followed by the round that answers its result. */
      const offer = (text: string, round: Round, threadId?: AssistantThreadId) =>
        converse(text, round === REPLY ? [round] : [round, REPLY], threadId);

      /** Accept what Hob offered on that turn, as the DM's Save does. */
      const accept = (began: { threadId: AssistantThreadId; turnId: AssistantTurnId }) =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const accepted = yield* as(jo.token, (client) =>
            client.hob.accept({
              params: { campaignId: table, threadId: began.threadId, turnId: began.turnId },
              payload: {},
            }),
          );
          if (accepted.accepted !== "encounter") throw new Error("accepted something else");
          return accepted.encounter;
        });

      /**
       * Every optional parameter, as an endpoint with an XML tool-call template
       * sends the ones it was told may be null: an integer or an array as a real
       * `null`, a string as the word. Before the word was read as absence, every
       * such call carried a challenge's outcome lines, and a social encounter —
       * which has none — was refused over text nobody meant.
       */
      const UNSET = {
        tags: null,
        setting: "null",
        creatures: null,
        tactics: null,
        treasure: "null",
        dc: null,
        successes: null,
        failures: null,
        onSuccess: "null",
        onFailure: "null",
        saveAbility: "null",
        onFail: "null",
        duration: "null",
        skills: null,
      } as const;

      it.effect(
        "carries the kind, tactics, treasure and challenge Hob offered into the record",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const { began, proposal } = yield* offer(
              "A hazard for the salt flats.",
              toolCallChunks("proposeEncounter", {
                name: "Salt-flat sandstorm",
                kind: "hazard",
                tactics: ["Visibility drops to 10 ft; the caravan can split.", "  "],
                treasure: "A lost merchant's strongbox, half buried",
                saveAbility: "CON",
                dc: 13,
                onFail: "1 level of exhaustion",
                duration: "1d4 hours",
                skills: ["Survival", "Animal Handling"],
              }),
            );
            expect(proposal).toMatchObject({
              target: "encounter",
              kind: "hazard",
              tactics: ["Visibility drops to 10 ft; the caravan can split."],
              treasure: "A lost merchant's strongbox, half buried",
              challenge: STORM,
              roster: [],
            });

            const accepted = yield* as(jo.token, (client) =>
              client.hob.accept({
                params: { campaignId: table, threadId: began.threadId, turnId: began.turnId },
                payload: {},
              }),
            );
            if (accepted.accepted !== "encounter") throw new Error("accepted something else");
            expect(accepted.encounter.kind).toBe("hazard");
            expect(accepted.encounter.origin).toBe("assistant");
            expect(yield* prepOf(jo, table, accepted.encounter.id)).toMatchObject({
              tactics: ["Visibility drops to 10 ft; the caravan can split."],
              treasure: "A lost merchant's strongbox, half buried",
              challenge: STORM,
            });

            // A follow-up in the same thread shows the model what it offered, prep and
            // all, so a redraft keeps what the DM was happy with.
            const before = chat.requests().length;
            yield* offer("Make it longer.", REPLY, began.threadId);
            const shown = JSON.stringify(chat.requests().slice(before));
            expect(shown).toContain("a hazard encounter called");
            expect(shown).toContain("saveAbility CON, dc 13");
            expect(shown).toContain("tactics: Visibility drops to 10 ft");
            expect(shown).toContain("treasure: A lost merchant's strongbox");
          }),
      );

      it.effect(
        "is a fight with no prep when Hob names none, as every proposal before this was",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const croaker = yield* run(
              Effect.flatMap(Creatures, (creatures) =>
                creatures.libraryCreate({
                  name: "Bullywug Croaker",
                  type: "humanoid",
                  cr: "1/4",
                  ac: 15,
                  hp: 11,
                }),
              ).pipe(Effect.provideService(CurrentActor, jo.actor)),
            );
            const { began, proposal } = yield* offer(
              "A fight in the reeds.",
              toolCallChunks("proposeEncounter", {
                name: "Song in the reeds",
                creatures: [{ creatureId: croaker.id, count: 3 }],
              }),
            );
            expect(proposal).toMatchObject({ target: "encounter", kind: "combat" });
            expect(proposal).not.toHaveProperty("tactics");
            expect(proposal).not.toHaveProperty("challenge");
            const accepted = yield* as(jo.token, (client) =>
              client.hob.accept({
                params: { campaignId: table, threadId: began.threadId, turnId: began.turnId },
                payload: {},
              }),
            );
            if (accepted.accepted !== "encounter") throw new Error("accepted something else");
            expect(accepted.encounter.kind).toBe("combat");
            // The roster came in with the encounter, through the create the form uses.
            expect(accepted.encounter.creatureCount).toBe(3);
            expect(yield* prepOf(jo, table, accepted.encounter.id)).toMatchObject({
              tactics: [],
              treasure: null,
              challenge: null,
              // Only a person says an encounter is ready; an accepted one is a draft.
              ready: false,
            });
          }),
      );

      it.effect(
        "offers a social encounter with its people and prep, and the accept writes it social",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const harbourmaster = yield* libraryCreature(jo, "Harbourmaster", "1/8");
            const { began, proposal } = yield* offer(
              "Make me a social encounter with the harbourmaster.",
              toolCallChunks("proposeEncounter", {
                ...UNSET,
                name: "Tolls at the salt quay",
                kind: "social",
                setting: "A timber quay stacked with salt barrels",
                creatures: [{ creatureId: harbourmaster.id, count: 1 }],
                tactics: [
                  "He wants the toll in coin, not scrip.",
                  "DC 14 Persuasion: he waves them through.",
                ],
                treasure: "None",
              }),
            );
            expect(proposal).toMatchObject({
              target: "encounter",
              kind: "social",
              setting: "A timber quay stacked with salt barrels",
              tactics: [
                "He wants the toll in coin, not scrip.",
                "DC 14 Persuasion: he waves them through.",
              ],
              roster: [{ creatureId: harbourmaster.id, count: 1, name: "Harbourmaster" }],
            });
            // "None" is no treasure, and "null" no outcome: neither is a value.
            expect(proposal).not.toHaveProperty("treasure");
            expect(proposal).not.toHaveProperty("challenge");

            const encounter = yield* accept(began);
            expect(encounter.kind).toBe("social");
            expect(encounter.origin).toBe("assistant");
            expect(encounter.creatureCount).toBe(1);
            expect(yield* prepOf(jo, table, encounter.id)).toMatchObject({
              tactics: [
                "He wants the toll in coin, not scrip.",
                "DC 14 Persuasion: he waves them through.",
              ],
              treasure: null,
              challenge: null,
            });
          }),
      );

      it.effect("offers a skill challenge with its outcome lines, and the accept writes them", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const { began, proposal } = yield* offer(
            "Build a skill challenge for crossing the flats.",
            toolCallChunks("proposeEncounter", {
              ...UNSET,
              name: "The dry well",
              kind: "challenge",
              tactics: ["Each failure costs a day's water."],
              dc: 14,
              successes: 3,
              failures: 2,
              onSuccess: "They find the buried cache.",
              onFailure: "The caravan turns back.",
              skills: ["Athletics", "Survival"],
            }),
          );
          const challenge = {
            kind: "challenge",
            dc: 14,
            successes: 3,
            failures: 2,
            onSuccess: "They find the buried cache.",
            onFailure: "The caravan turns back.",
            skills: ["Athletics", "Survival"],
          };
          expect(proposal).toMatchObject({
            target: "encounter",
            kind: "challenge",
            challenge,
            roster: [],
          });

          const encounter = yield* accept(began);
          expect(encounter.kind).toBe("challenge");
          expect(yield* prepOf(jo, table, encounter.id)).toMatchObject({
            tactics: ["Each failure costs a day's water."],
            challenge,
          });
        }),
      );

      it.effect(
        "tells Hob what to change on a social encounter with a challenge's numbers, and offers the fix",
        () =>
          Effect.gen(function* () {
            const before = chat.requests().length;
            const { events, began, proposal } = yield* converse(
              "A tense talk with the toll-keeper.",
              [
                toolCallChunks("proposeEncounter", {
                  name: "The toll-keeper",
                  kind: "social",
                  dc: 14,
                  skills: ["Persuasion", "Insight"],
                  onSuccess: "He waves them through",
                }),
                toolCallChunks("proposeEncounter", {
                  name: "The toll-keeper",
                  kind: "social",
                  tactics: ["DC 14 Persuasion or Insight: he waves them through."],
                }),
                REPLY,
              ],
            );
            // The refusal the model read names what it sent, where the checks go, and
            // that nothing reached the DM — the words a retry is made from.
            const refusal = JSON.stringify(chat.requests()[before + 1]?.messages?.at(-1));
            expect(refusal).toContain("leave out dc, onSuccess and skills");
            expect(refusal).toContain("in tactics");
            expect(refusal).toContain("Nothing was offered to the DM");
            expect(proposal).toMatchObject({ kind: "social", name: "The toll-keeper" });
            expect(events.at(-1)?.event).toBe("done");

            const encounter = yield* accept(began);
            expect(encounter.kind).toBe("social");
          }),
      );

      it.effect("never closes a refused turn as done, whatever the reply claims", () =>
        Effect.gen(function* () {
          const { events, proposal } = yield* converse("Make me a social encounter at the gate.", [
            toolCallChunks("proposeEncounter", { name: "At the gate", kind: "social", dc: 12 }),
            textChunks("Your social encounter is ready to view."),
          ]);
          expect(proposal).toBeUndefined();
          expect(events.some((event) => event.event === "done")).toBe(false);
          const last = events.at(-1);
          expect(last?.event).toBe("failed");
          expect(last?.event === "failed" ? last.data.message : "").toContain(
            "nothing reached you",
          );
        }),
      );

      it.effect(
        "refuses, in words Hob can act on, a fight with nobody in it and numbers for the wrong kind",
        () =>
          Effect.gen(function* () {
            for (const call of [
              { name: "Empty fight" },
              { name: "Chatty", kind: "social", dc: 12 },
              { name: "Half a challenge", kind: "challenge", dc: 12 },
            ]) {
              const { proposal } = yield* offer(
                "Something.",
                toolCallChunks("proposeEncounter", call),
              );
              expect(proposal).toBeUndefined();
            }
            // What the model was told, the round after its call.
            const said = JSON.stringify(chat.requests().slice(-6));
            expect(said).toContain("a fight needs at least one creature");
            expect(said).toContain("set kind to social, challenge or hazard");
            expect(said).toContain("a social encounter has no challenge, so leave out dc");
            expect(said).toContain("a challenge takes dc, successes and failures");
            expect(said).toContain("give successes and failures");
          }),
      );
    });

    /** A creature in `who`'s own Library. */
    const libraryCreature = (who: Person, name: string, cr: string) =>
      run(
        Effect.flatMap(Creatures, (creatures) =>
          creatures.libraryCreate({ name, type: "humanoid", cr, ac: 12, hp: 9 }),
        ).pipe(Effect.provideService(CurrentActor, who.actor)),
      );

    describe("an encounter made with its roster", () => {
      it.effect(
        "makes the roster in the same create, instanced and counted on the row it returns",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const croaker = yield* libraryCreature(jo, "Reed Croaker", "1/4");
            const chief = yield* libraryCreature(jo, "Reed Chief", "2");

            const made = yield* encounterAt(jo, table, {
              name: "Chorus in the reeds",
              creatures: [
                { creatureId: croaker.id, count: 4 },
                { creatureId: chief.id, count: 1 },
              ],
            });
            expect(made.creatureCount).toBe(5);
            // Rated against the roster just written: creatures, but nobody seated.
            expect(made.difficulty).toEqual({ _tag: "unrated", reason: "no-party" });
            expect(made.origin).toBe("authored");

            const roster = yield* as(jo.token, (client) =>
              client.encounterCreatures.list({
                params: { campaignId: table, encounterId: made.id },
              }),
            );
            expect(roster.map((line) => [line.name, line.count])).toEqual([
              ["Reed Croaker", 4],
              ["Reed Chief", 1],
            ]);
            // Library originals are instanced into the campaign, as a line added on
            // its own is, and the lines carry no assistant trail.
            expect(roster.map((line) => line.creatureId)).not.toContain(croaker.id);
            expect(roster.every((line) => line.origin === "authored")).toBe(true);

            const found = yield* as(jo.token, (client) =>
              client.encounters.findById({ params: { campaignId: table, encounterId: made.id } }),
            );
            expect(found).toEqual(made);
          }),
      );

      it.effect(
        "refuses the whole encounter for one creature the campaign cannot use, and leaves nothing",
        () =>
          Effect.gen(function* () {
            const { jo, stranger, table } = yield* Fixture;
            const mine = yield* libraryCreature(jo, "Mudskipper", "1/8");
            // Another account's Library original: not Jo's to put on a roster.
            const theirs = yield* libraryCreature(stranger, "Bo's secret horror", "5");

            expect(
              yield* attempt(jo.token, (client) =>
                client.encounters.create({
                  params: { campaignId: table },
                  payload: {
                    name: "Half an ambush",
                    creatures: [
                      { creatureId: mine.id, count: 2 },
                      { creatureId: theirs.id, count: 1 },
                    ],
                  },
                }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });

            const left = yield* run(
              Effect.gen(function* () {
                const sql = yield* SqlClient.SqlClient;
                const encounters = yield* sql<{ readonly count: number }>`
          select count(*)::int as count from encounter where name = 'Half an ambush'
        `;
                // The line before the refused one had already minted its instance.
                const instances = yield* sql<{ readonly count: number }>`
          select count(*)::int as count from creature where derived_from = ${mine.id}
        `;
                return { encounters: encounters[0]!.count, instances: instances[0]!.count };
              }),
            );
            expect(left).toEqual({ encounters: 0, instances: 0 });
          }),
      );

      it.effect(
        "refuses a creature named twice, a count out of bounds, and an overlong roster",
        () =>
          Effect.gen(function* () {
            const { jo, table } = yield* Fixture;
            const croaker = yield* libraryCreature(jo, "Twice Croaker", "1/4");
            const post = (creatures: unknown) =>
              raw("post", jo.token, `/campaigns/${table}/encounters`, {
                name: "Bad roster",
                creatures,
              });
            expect(
              yield* post([
                { creatureId: croaker.id, count: 2 },
                { creatureId: croaker.id, count: 1 },
              ]),
            ).toBe(400);
            expect(yield* post([{ creatureId: croaker.id, count: 0 }])).toBe(400);
            expect(yield* post([{ creatureId: croaker.id, count: 1000 }])).toBe(400);
            expect(yield* post([{ creatureId: croaker.id }])).toBe(400);
            expect(
              yield* post(
                Array.from({ length: 51 }, (_, index) => ({
                  creatureId: `2b1f2a1e-0000-4000-8000-${String(index).padStart(12, "0")}`,
                  count: 1,
                })),
              ),
            ).toBe(400);
          }),
      );

      it.effect("answers a player NotFound, roster or not, and makes nothing", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const pell = yield* person("Pell");
          yield* run(admittedTo(table, pell.actor, "Pell"));
          const croaker = yield* libraryCreature(jo, "Player's Croaker", "1/4");
          for (const creatures of [undefined, [{ creatureId: croaker.id, count: 1 }]]) {
            expect(
              yield* attempt(pell.token, (client) =>
                client.encounters.create({
                  params: { campaignId: table },
                  payload: {
                    name: "From a player",
                    ...(creatures === undefined ? {} : { creatures }),
                  },
                }),
              ),
            ).toEqual({ ok: false, tag: "NotFound" });
          }
          const listed = yield* as(jo.token, (client) =>
            client.encounters.list({ params: { campaignId: table }, query: {} }),
          );
          expect(listed.items.map((entry) => entry.name)).not.toContain("From a player");
        }),
      );
    });

    describe("an encounter's Ready", () => {
      it.effect("is a draft until the DM says so, and turns back into one", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const drafted = yield* encounterAt(jo, table, { name: "Toll at the bridge" });
          expect((yield* prepOf(jo, table, drafted.id)).ready).toBe(false);

          const readied = yield* encounterAt(jo, table, { name: "Bridge collapse", ready: true });
          expect((yield* prepOf(jo, table, readied.id)).ready).toBe(true);
          // The list read carries it, so the Encounters list can badge every row.
          const listed = yield* as(jo.token, (client) =>
            client.encounterPrep.list({ params: { campaignId: table } }),
          );
          expect(
            Object.fromEntries(
              listed
                .filter(
                  (entry) => entry.encounterId === drafted.id || entry.encounterId === readied.id,
                )
                .map((entry) => [entry.encounterId, entry.ready]),
            ),
          ).toEqual({ [drafted.id]: false, [readied.id]: true });

          yield* as(jo.token, (client) =>
            client.encounters.update({
              params: { campaignId: table, encounterId: drafted.id },
              payload: { ready: true },
            }),
          );
          yield* as(jo.token, (client) =>
            client.encounters.update({
              params: { campaignId: table, encounterId: readied.id },
              payload: { ready: false, name: "Bridge collapse, redrawn" },
            }),
          );
          expect((yield* prepOf(jo, table, drafted.id)).ready).toBe(true);
          expect((yield* prepOf(jo, table, readied.id)).ready).toBe(false);
          // A patch that does not name it leaves it.
          yield* as(jo.token, (client) =>
            client.encounters.update({
              params: { campaignId: table, encounterId: drafted.id },
              payload: { tactics: ["Hold the far bank."] },
            }),
          );
          expect((yield* prepOf(jo, table, drafted.id)).ready).toBe(true);
        }),
      );

      it.effect("is the creator's alone: a player neither reads nor writes it", () =>
        Effect.gen(function* () {
          const { jo, table } = yield* Fixture;
          const quill = yield* person("Quill");
          yield* run(admittedTo(table, quill.actor, "Quill"));
          const shared = yield* encounterAt(jo, table, {
            name: "Shown and ready",
            visibility: "shared",
            ready: true,
          });
          const found = yield* as(quill.token, (client) =>
            client.playerEncounters.find({ params: { campaignId: table, encounterId: shared.id } }),
          );
          expect(found).not.toHaveProperty("ready");
          expect(
            yield* attempt(quill.token, (client) =>
              client.encounterPrep.find({ params: { campaignId: table, encounterId: shared.id } }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect(
            yield* attempt(quill.token, (client) =>
              client.encounters.update({
                params: { campaignId: table, encounterId: shared.id },
                payload: { ready: false },
              }),
            ),
          ).toEqual({ ok: false, tag: "NotFound" });
          expect((yield* prepOf(jo, table, shared.id)).ready).toBe(true);
        }),
      );
    });
  },
);
