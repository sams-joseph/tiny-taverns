import {
  BattleMap,
  battleMapHasSubject,
  battleMapPromptFor,
  Campaign,
  campaignImageHasSubject,
  campaignImagePromptFor,
  Character,
  type CurrentActor,
  type Encounter,
  HOUSE_COVER_STYLE,
  HOUSE_MAP_STYLE,
  HOUSE_PORTRAIT_STYLE,
  NotFound,
  Npc,
  npcImageHasSubject,
  npcImagePromptFor,
  portraitHasSubject,
  portraitPromptFor,
  SharedWorld,
  sharedWorldImageHasSubject,
  sharedWorldImagePromptFor,
} from "@taverns/api";
import {
  Cause,
  Context,
  Duration,
  Effect,
  FiberSet,
  Layer,
  Option,
  Schedule,
  Semaphore,
} from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import {
  type ImageFailure,
  type ImageJob,
  type ImageLimits,
  ImageRecords,
  imageObjectKey,
} from "../repo/Images.js";
import { ObjectStorage, StorageKey } from "../storage/ObjectStorage.js";
import { ImageModel } from "./ImageModel.js";
import { type ImageRequest, ImageUrls } from "./ImageUrls.js";
import { IMAGE_KINDS, type ImageKind } from "./kinds.js";
import { renderImage } from "./render.js";

/**
 * Hob draws a picture of a thing a person made, once, after it is made — a
 * character's portrait, a campaign's or a Shared World's cover, an NPC's
 * portrait, an encounter's battle map — and this is the server's **one
 * background worker**, the same for every kind (`kinds.ts`).
 *
 * ### The trigger
 *
 * Each kind has one entry point here, called by every handler that makes that
 * kind of thing **after** its transaction commits, with the row it returns:
 * {@link HobImages} `drawCharacter` from the form's `POST …/characters` and
 * Hob's accept, `drawCampaign` from `POST /campaigns` and
 * `POST /worlds/:worldId/campaigns`, `drawSharedWorld` from `POST /worlds` and
 * `POST /campaigns/:campaignId/shared-world` (promotion), `drawNpc` from the
 * cast's create and its copy from the Library, `drawBattleMap` from
 * `POST /campaigns/:c/encounters` and Hob's encounter accept. It records the one image row the subject
 * will ever have (`repo/Images.ts` `start`, which also applies the shared daily
 * caps, the nothing-to-draw-from skip and the kind's rule about who may start
 * one) and hands a drawing row to a fiber. The request does not wait: a closed
 * tab still gets the picture, and a slow provider never holds a connection open.
 *
 * ### The job
 *
 * A service-owned `FiberSet`, so shutdown interrupts every job cleanly, and a
 * `Semaphore` of `PORTRAIT_CONCURRENCY` shared by every kind. Each job —
 * waiting for a permit included — runs under {@link JOB_TIMEOUT}: call the
 * image model at the kind's size, decode and resize with `sharp`, then store
 * every file and mark the row `ready` inside one transaction that holds the
 * row's lock (see `ImageRecords.store` for why that makes a delete mid-draw
 * safe). Any failure marks the row `failed` with its kind and enqueues the
 * prefix; provider text goes to the log only.
 *
 * ### The loop
 *
 * At boot and every minute: rows of any kind still `generating` past
 * {@link STALE_AFTER_SECONDS} belong to a process that died and become
 * `interrupted`, and due `storage_deletion` rows are drained through
 * `ObjectStorage.deletePrefix`. The loop runs whenever storage is on, whether
 * or not generation is, because a deleted subject's files must go either way.
 *
 * ### One instance
 *
 * The hand-off is in-process. A second server instance would draw its own
 * creations and sweep correctly (the sweep only touches rows older than any
 * live job can be), but replacing the hand-off with a `for update skip
 * locked` pickup over `generating` rows is the step for real horizontal scale.
 */

/** OpenAI says complex prompts may take up to two minutes. */
export const JOB_TIMEOUT = Duration.seconds(150);

/** Older than any job can live, with slack for a slow commit. */
export const STALE_AFTER_SECONDS = 170;

const LOOP_EVERY = Duration.minutes(1);
const DRAIN_BATCH = 50;

export interface ImageGeneration {
  readonly limits: ImageLimits;
  readonly concurrency: number;
  /** {@link JOB_TIMEOUT} unless a test needs a timeout it can wait for. */
  readonly timeout?: Duration.Input;
}

export class HobImages extends Context.Service<
  HobImages,
  {
    /** Whether a new character, campaign, Shared World, NPC or battle map will be drawn. */
    readonly generating: boolean;
    /**
     * See the header. Answers the character again, `portraitPending` when a
     * draw started. Never fails: a portrait is not worth failing a create for.
     */
    readonly drawCharacter: (character: Character) => Effect.Effect<Character, never, CurrentActor>;
    /** The same for a campaign's cover: `imagePending` when a draw started. */
    readonly drawCampaign: (campaign: Campaign) => Effect.Effect<Campaign, never, CurrentActor>;
    /** The same for a Shared World's cover: `imagePending` when a draw started. */
    readonly drawSharedWorld: (
      world: SharedWorld,
    ) => Effect.Effect<SharedWorld, never, CurrentActor>;
    /**
     * The same for a campaign NPC's portrait, drawn only from its public
     * persona (`npcImagePromptFor`): `imagePending` when a draw started.
     */
    readonly drawNpc: (npc: Npc) => Effect.Effect<Npc, never, CurrentActor>;
    /**
     * The same for a new encounter's battle map, drawn from the map's setting
     * line coloured by the encounter's name and tags, or without one from the
     * name, tags and the roster's creature types (`battleMapPromptFor`) —
     * never a creature's name: `imagePending` when a draw started.
     */
    readonly drawBattleMap: (
      map: BattleMap,
      encounter: Pick<Encounter, "name" | "tags">,
      creatureTypes: ReadonlyArray<string>,
    ) => Effect.Effect<BattleMap, never, CurrentActor>;
    /** An image route: a checked signature, a ready row, the stored bytes. */
    readonly image: (
      kind: ImageKind,
      request: ImageRequest,
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, NotFound>;
    /** Delete every due prefix in `storage_deletion`, now. */
    readonly drainDeletions: Effect.Effect<void>;
    /** Start a drain in the background; what a delete handler does after it commits. */
    readonly drainSoon: Effect.Effect<void>;
    /** Mark stale `generating` rows `interrupted`. Answers how many. */
    readonly sweep: Effect.Effect<number>;
    /** Resolves when no job is running. For tests. */
    readonly idle: Effect.Effect<void>;
  }
>()("HobImages") {
  /**
   * @param generation `None` when images are OFF; images already drawn are
   *   still served and deletions still drained while storage is on.
   * @param storageOn whether `STORAGE_DRIVER` names a provider. With storage
   *   off there are no files to serve or delete, so the loop does not run.
   */
  static readonly layer = (options: {
    readonly generation: Option.Option<ImageGeneration>;
    readonly storageOn: boolean;
  }): Layer.Layer<HobImages, never, ImageRecords | ObjectStorage | ImageUrls> =>
    Layer.effect(this)(
      Effect.gen(function* () {
        const records = yield* ImageRecords;
        const storage = yield* ObjectStorage;
        const urls = yield* ImageUrls;
        const model = yield* Effect.serviceOption(ImageModel);
        const jobs = yield* FiberSet.make<void, never>();
        // The loop and kicked drains, apart from the jobs so `idle` means
        // "no image is being drawn".
        const housekeeping = yield* FiberSet.make<void, never>();
        const permits = yield* Semaphore.make(
          Option.match(options.generation, {
            onNone: () => 1,
            onSome: (generation) => Math.max(1, generation.concurrency),
          }),
        );

        const timeout = Option.match(options.generation, {
          onNone: () => JOB_TIMEOUT,
          onSome: (generation) => generation.timeout ?? JOB_TIMEOUT,
        });

        const failureOf = (cause: Cause.Cause<unknown>): ImageFailure => {
          const error = Cause.squash(cause);
          if (Cause.isTimeoutError(error)) return "timeout";
          const tag =
            typeof error === "object" && error !== null && "_tag" in error ? error._tag : undefined;
          switch (tag) {
            case "ImageRefused":
              return "refused";
            case "StorageError":
            case "StorageUnavailable":
              return "storage";
            default:
              return "provider";
          }
        };

        const draw = (image: ImageModel["Service"], job: ImageJob) =>
          Effect.gen(function* () {
            const drawn = yield* image.generate(job.prompt, IMAGE_KINDS[job.kind].size);
            const rendered = yield* renderImage(job.kind, drawn.bytes);
            const files = [
              {
                key: imageObjectKey(job.prefix, `original.${rendered.original.ext}`),
                bytes: rendered.original.bytes,
                contentType: rendered.original.contentType,
              },
              ...rendered.variants.map(({ variant, bytes }) => ({
                key: imageObjectKey(job.prefix, `${variant}.webp`),
                bytes,
                contentType: "image/webp",
              })),
            ];
            yield* records.store(
              job,
              Effect.forEach(files, (file) => storage.put(file.key, file.bytes, file.contentType), {
                discard: true,
              }),
              {
                originalType: rendered.original.contentType,
                sha256: rendered.sha256,
                width: rendered.width,
                height: rendered.height,
                originalBytes: rendered.original.bytes.byteLength,
                storedBytes: files.reduce((total, file) => total + file.bytes.byteLength, 0),
                inputTokens: drawn.inputTokens,
                outputTokens: drawn.outputTokens,
              },
            );
          }).pipe(
            Semaphore.withPermit(permits),
            Effect.timeout(timeout),
            Effect.catchCause((cause) =>
              // Shutdown interrupts the job; the row stays `generating` and the
              // next sweep calls it `interrupted`.
              Cause.hasInterruptsOnly(cause)
                ? Effect.void
                : Effect.gen(function* () {
                    const failure = failureOf(cause);
                    // The provider's own words, for the operator; the record
                    // and the wire keep only the kind.
                    const error = Cause.squash(cause);
                    const detail =
                      typeof error === "object" && error !== null && "detail" in error
                        ? ` ${String(error.detail)}`
                        : "";
                    yield* Effect.logWarning(
                      `Image ${job.kind}/${job.id} failed (${failure}):${detail} ${Cause.pretty(cause)}`,
                    );
                    yield* records.fail(job, failure);
                  }),
            ),
          );

        const drainDeletions = Effect.gen(function* () {
          const due = yield* records.dueDeletions(DRAIN_BATCH);
          for (const deletion of due) {
            const outcome = yield* Effect.suspend(() =>
              storage.deletePrefix(StorageKey(deletion.prefix)),
            ).pipe(Effect.exit);
            if (outcome._tag === "Success") yield* records.deletionDone(deletion.id);
            else yield* records.deletionFailed(deletion.id, Cause.pretty(outcome.cause));
          }
        });

        const drainQuietly = drainDeletions.pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning(`Draining storage deletions failed: ${Cause.pretty(cause)}`),
          ),
        );

        const sweep = records.sweepStale(STALE_AFTER_SECONDS);

        if (options.storageOn) {
          yield* Effect.all([sweep, drainDeletions]).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning(`Image housekeeping failed: ${Cause.pretty(cause)}`),
            ),
            Effect.repeat(Schedule.spaced(LOOP_EVERY)),
            Effect.asVoid,
            FiberSet.run(housekeeping),
          );
        }

        const generation = Option.flatMap(options.generation, (settings) =>
          Option.map(model, (image) => ({ settings, image })),
        );

        /**
         * Start the one draw of a subject: `true` when a job was handed to a
         * fiber. `prompt` is `undefined` when there is nothing to draw from.
         * Never fails; a picture is not worth failing a create for.
         */
        const start = (
          kind: ImageKind,
          subjectId: string,
          prompt: () => string | undefined,
        ): Effect.Effect<boolean, never, CurrentActor> =>
          Option.match(generation, {
            onNone: () => Effect.succeed(false),
            onSome: ({ settings, image }) =>
              Effect.gen(function* () {
                const job = yield* records.start(kind, subjectId, {
                  prompt: prompt(),
                  model: image.model,
                  limits: settings.limits,
                });
                if (job === undefined) return false;
                yield* FiberSet.run(jobs, draw(image, job));
                return true;
              }).pipe(
                Effect.catchCause((cause) =>
                  Effect.as(
                    Effect.logWarning(
                      `Could not start an image for ${kind} ${subjectId}: ${Cause.pretty(cause)}`,
                    ),
                    false,
                  ),
                ),
              ),
          });

        return {
          generating: Option.isSome(generation),

          drawCharacter: (character) =>
            Effect.map(
              start("character", character.id, () =>
                portraitHasSubject(character)
                  ? portraitPromptFor(character, { style: HOUSE_PORTRAIT_STYLE })
                  : undefined,
              ),
              (pending) =>
                pending ? new Character({ ...character, portraitPending: true }) : character,
            ),

          drawCampaign: (campaign) =>
            Effect.map(
              start("campaign", campaign.id, () =>
                campaignImageHasSubject(campaign)
                  ? campaignImagePromptFor(campaign, { style: HOUSE_COVER_STYLE })
                  : undefined,
              ),
              (pending) => (pending ? new Campaign({ ...campaign, imagePending: true }) : campaign),
            ),

          drawSharedWorld: (world) =>
            Effect.map(
              start("sharedWorld", world.id, () =>
                sharedWorldImageHasSubject(world)
                  ? sharedWorldImagePromptFor(world, { style: HOUSE_COVER_STYLE })
                  : undefined,
              ),
              (pending) => (pending ? new SharedWorld({ ...world, imagePending: true }) : world),
            ),

          drawNpc: (npc) =>
            Effect.map(
              start("npc", npc.id, () =>
                npcImageHasSubject(npc)
                  ? npcImagePromptFor(npc, { style: HOUSE_PORTRAIT_STYLE })
                  : undefined,
              ),
              (pending) => (pending ? new Npc({ ...npc, imagePending: true }) : npc),
            ),

          drawBattleMap: (map, encounter, creatureTypes) =>
            Effect.map(
              start("battleMap", map.id, () => {
                const subject = {
                  name: encounter.name,
                  tags: encounter.tags,
                  setting: map.setting,
                  creatureTypes,
                };
                return battleMapHasSubject(subject)
                  ? battleMapPromptFor(subject, { style: HOUSE_MAP_STYLE })
                  : undefined;
              }),
              (pending) => (pending ? new BattleMap({ ...map, imagePending: true }) : map),
            ),

          image: (kind, request) =>
            Effect.gen(function* () {
              const missing = new NotFound({
                resource: IMAGE_KINDS[kind].tag,
                id: request.imageId,
              });
              const checked = urls.verify(kind, request);
              if (checked === undefined) return yield* missing;
              const prefix = yield* records.readyPrefix(kind, request.imageId);
              if (prefix === undefined) return yield* missing;
              const object = yield* storage
                .get(imageObjectKey(prefix, `${checked.variant}.webp`))
                .pipe(
                  Effect.catchTag("StorageNotFound", () => Effect.fail(missing)),
                  Effect.catchTags({
                    StorageError: (error) => Effect.die(error),
                    StorageUnavailable: (error) => Effect.die(error),
                  }),
                );
              return HttpServerResponse.stream(object.body, {
                contentType: "image/webp",
                contentLength: object.size,
                headers: {
                  "cache-control": `private, max-age=${String(checked.remainingSeconds)}, immutable`,
                  "x-content-type-options": "nosniff",
                  "content-security-policy": "default-src 'none'",
                },
              });
            }),

          drainDeletions: drainQuietly,
          drainSoon: options.storageOn
            ? Effect.asVoid(FiberSet.run(housekeeping, drainQuietly))
            : Effect.void,
          sweep,
          idle: FiberSet.awaitEmpty(jobs),
        };
      }),
    );
}
