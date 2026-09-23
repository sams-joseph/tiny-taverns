import { Config, Redacted } from "effect";
import { fileURLToPath } from "node:url";

/**
 * The database the committed `compose.yaml` brings up on `pnpm db:up`.
 *
 * These are not credentials in any meaningful sense — the same throwaway
 * user/password are in `compose.yaml`, the port is bound to loopback, and a
 * deployment supplies `DATABASE_URL` from its own secret store. Defaulting it
 * here is what makes `pnpm db:up && pnpm -F server dev` work with no setup.
 */
export const DEV_DATABASE_URL = "postgres://taverns:taverns@127.0.0.1:5433/taverns";

export const databaseUrl = Config.redacted("DATABASE_URL").pipe(
  Config.withDefault(Redacted.make(DEV_DATABASE_URL)),
);

export const port = Config.port("PORT").pipe(Config.withDefault(3000));

/**
 * Origins allowed to call the API from a browser. `apps/web` runs on 5173 in
 * development; a deployment sets `ALLOWED_ORIGINS` to its own.
 *
 * Read here rather than in `app.ts` because two things need it: the CORS
 * allowlist, and the `azp` audience check on a hosted session token. Those two
 * answer the same question — "which front end is this?" — and drifting apart
 * fails in a way nobody enjoys diagnosing: the browser is allowed to make the
 * call, and the server then rejects the credential it carries.
 */
export const allowedOrigins = Config.string("ALLOWED_ORIGINS").pipe(
  Config.map((value) => value.split(",").map((origin) => origin.trim())),
  Config.withDefault(["http://localhost:5173", "http://127.0.0.1:5173"]),
);

/**
 * How often a quiet live stream emits a keep-alive, in seconds.
 *
 * Configurable because the number that matters is a property of whatever sits
 * in front of the server, not of the server: an idle connection is commonly cut
 * at 60 seconds by nginx and at 30 or less by some CDNs, with nothing said to
 * either end. The default is under all of those, and short enough that a client
 * can call a stream dead after two missed beats without being twitchy.
 *
 * It is also what lets the heartbeat be *tested* in a second rather than in
 * twenty — a property that costs twenty seconds of every CI run tends to get
 * deleted, and then nothing checks it at all.
 */
export const liveHeartbeatSeconds = Config.int("LIVE_HEARTBEAT_SECONDS").pipe(
  Config.withDefault(20),
);

/**
 * Where Hob's model lives — an OpenAI-compatible `/v1` base URL.
 *
 * `Option` rather than a default, for the reason `clerkJwtKey` is: unset is a
 * *supported mode* and not a missing value. With no endpoint the server boots,
 * the suite passes, and the panel says nothing is behind it — the assistant is
 * an opt-in dependency exactly as hosted sign-in is, and there is no sensible
 * committed default for a machine that may not be running one.
 *
 * The captain's decision is locally hosted models, so this is ordinarily a
 * loopback address: `http://127.0.0.1:8080/v1` for llama.cpp's server,
 * `http://127.0.0.1:11434/v1` for Ollama, `http://127.0.0.1:1234/v1` for LM
 * Studio. A hosted provider is the same shape and a different URL.
 */
export const hobApiUrl = Config.option(Config.string("HOB_API_URL"));

/**
 * Which model to ask. No default, and Hob is off unless both this and the URL
 * are set — an endpoint with the wrong model name fails on the first question
 * with a provider error, which is a much worse way to find out than a boot line
 * saying Hob is off.
 */
export const hobModel = Config.option(Config.string("HOB_MODEL"));

/**
 * An API key for the model endpoint, if it wants one.
 *
 * `Option` because most local servers ignore it and some (vLLM) insist on a
 * placeholder. `Redacted` because it is the one genuinely secret thing on this
 * page, and nothing in this repo may ever commit one — `.env.*` is gitignored
 * and `.env.example` carries the name only.
 */
export const hobApiKey = Config.option(Config.redacted("HOB_API_KEY"));

/**
 * The output cap sent with every generation request, always and explicitly.
 *
 * **Never leave this to the provider package.** At `4.0.0-beta.102`,
 * `@effect/ai-anthropic`'s `getModelCapabilities` recognises no model id past
 * `claude-opus-4-8` and its fallback silently caps `max_tokens` at 4096 *and*
 * disables native structured output — the model parameter is typed
 * `(string & {}) | Model`, so a newer id compiles and never errors. The first
 * symptom is an answer that stops mid-sentence. The habit of naming the number
 * costs one config line and makes the trap impossible; `test/hob.test.ts`
 * asserts the value reaches the wire.
 *
 * **4096, not 1024, and the difference is reasoning tokens.** The old number
 * was reasoned from the length of a reply — "a sentence or two by design" — and
 * that is the wrong quantity: this caps everything the model *emits*, and on a
 * reasoning model most of that is thinking nobody ever sees. Measured against a
 * real Qwen3-8B, the trivial question "Who is the ferryman?" spent 120 reasoning
 * tokens before its first tool call, and two of six ordinary questions used the
 * whole 1024 without reaching one — which the panel then showed as an empty
 * answer, or (on an endpoint that leaves `<think>` in `content`) as nothing but
 * text deltas and no tool call, ever. That is the captain's "Hob never calls a
 * tool". See `assistant/Hob.ts`'s `truncated`, which is what says so out loud
 * now, and AGENTS.md for the measurements.
 *
 * A cap is not an allocation: raising it costs nothing on an answer that stays
 * short, and it is the one number that turns a capable local model from mute
 * into useful.
 */
export const hobMaxTokens = Config.int("HOB_MAX_TOKENS").pipe(Config.withDefault(4096));

/** Campaign-wide player/NPC messages per UTC day. Per-player minute cap is fixed at 10. */
export const npcPlayerCampaignDailyLimit = Config.int("NPC_PLAYER_CAMPAIGN_DAILY_LIMIT").pipe(
  Config.withDefault(500),
);

/**
 * Clerk's JWT public verification key, in PEM form.
 *
 * **Not a secret** — it is a public key, and verification is the only thing it
 * can do. Clerk dashboard → API keys → Show JWT public key → PEM Public Key.
 * `CLERK_SECRET_KEY` is deliberately absent from this file and from the
 * server: nothing in this design needs it, and adding it would put a
 * credential capable of *minting* sessions next to the one that only checks
 * them.
 *
 * `Option` rather than a default, because `None` is a supported mode and not a
 * missing value: unset means no hosted sign-in is configured, machine tokens
 * still work, and the whole suite still passes. There is no sensible committed
 * default for a key that differs per instance.
 */
export const clerkJwtKey = Config.option(Config.string("CLERK_JWT_KEY"));

/**
 * Which object storage provider holds files, the choice `storageFromConfig` in
 * `app.ts` makes.
 *
 * `Option` for the reason `hobApiUrl` is: unset is a supported mode, storage is
 * OFF, and anything that needs it answers `StorageUnavailable`. A value that
 * names no driver fails the boot rather than quietly meaning OFF, since a typo
 * would otherwise look exactly like a deliberate choice.
 *
 * `filesystem` is the only driver so far. A hosted provider is a new value
 * here and a new adapter; see `docs/internals/storage.md`.
 */
export const storageDriver = Config.option(Config.literals(["filesystem"], "STORAGE_DRIVER"));

/**
 * The directory the `filesystem` driver writes under. A relative value is
 * resolved against the working directory. The default is `apps/server/.storage`,
 * resolved from this module so it is the same place under `tsx` and under
 * `node dist/main.js`, and it is gitignored.
 */
export const storageFsRoot = Config.string("STORAGE_FS_ROOT").pipe(
  Config.withDefault(fileURLToPath(new URL("../.storage", import.meta.url))),
);

/**
 * Where portraits are drawn: an OpenAI-shaped `/v1` base URL that serves
 * `POST /images/generations` and answers `b64_json` — OpenAI itself
 * (`https://api.openai.com/v1`), or a local `sd-server`.
 *
 * `Option` for the reason `hobApiUrl` is: unset is a supported mode, portraits
 * are OFF, and every character keeps its lettered plate. Generation needs this,
 * `PORTRAIT_MODEL`, `PORTRAIT_URL_SECRET` and storage (`STORAGE_DRIVER`); the
 * boot line names whichever is missing.
 */
export const portraitApiUrl = Config.option(Config.string("PORTRAIT_API_URL"));

/** Which image model to ask, as that endpoint names it. `gpt-image-2.5-flare` on OpenAI. */
export const portraitModel = Config.option(Config.string("PORTRAIT_MODEL"));

/** A key for the image endpoint, if it wants one. Secret, like `HOB_API_KEY`. */
export const portraitApiKey = Config.option(Config.redacted("PORTRAIT_API_KEY"));

/**
 * OpenAI's `quality`, sent only to api.openai.com (see `portraits/ImageModel.ts`).
 * `medium` is the cost the plan was priced at.
 */
export const portraitQuality = Config.literals(
  ["low", "medium", "high", "auto"],
  "PORTRAIT_QUALITY",
).pipe(Config.withDefault("medium" as const));

/**
 * The HMAC key image URLs are signed with. Without it no URL can be minted, so
 * portraits are OFF — a per-process random key would break every URL at each
 * restart and between two instances, which looks like a storage bug.
 */
export const portraitUrlSecret = Config.option(Config.redacted("PORTRAIT_URL_SECRET"));

/** How many portraits draw at once in this process. */
export const portraitConcurrency = Config.int("PORTRAIT_CONCURRENCY").pipe(Config.withDefault(2));

/** Portraits one account may have drawn per UTC day. */
export const portraitAccountDailyLimit = Config.int("PORTRAIT_ACCOUNT_DAILY_LIMIT").pipe(
  Config.withDefault(10),
);

/** Portraits this server may have drawn per UTC day, across every account. */
export const portraitDailyLimit = Config.int("PORTRAIT_DAILY_LIMIT").pipe(Config.withDefault(200));
