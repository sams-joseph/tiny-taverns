# Storage: the cloud storage adapter

The server keeps files (character portraits first) behind one Effect service, `ObjectStorage` in `apps/server/src/storage/ObjectStorage.ts`. Where they are hosted is not decided, and the code must not care: every provider is one implementation of that interface, chosen by an environment variable, and swapping providers means writing one adapter and nothing else.

## The interface is provider-neutral

- **Keys are `StorageKey`s**: slash-separated segments of `A-Z a-z 0-9 . _ -`, no `.`/`..`, no empty segment, no leading or trailing slash, at most 512 characters. The brand is checked where a key is minted, so every adapter sees only keys every other adapter also accepts. `@` is outside the alphabet on purpose; the file-system adapter uses it for its own file names.
- **Operations**: `put` (bytes and a content type, replacing), `get` (metadata plus a byte stream, or `StorageNotFound`), `head` (metadata or `None`), `delete` (idempotent), `deletePrefix` (idempotent).
- **`deletePrefix(p)` removes keys under `p/`**, at any depth. It does not remove an object stored at `p` itself, or `p2/…`. S3-style providers must list with the trailing slash to match.
- **No bucket, region, endpoint or URL appears in the interface.** A provider's configuration is its adapter's business, read in its branch of `storageFromConfig`.
- **Errors are ours**: `StorageNotFound`, `StorageError` and `StorageUnavailable`. `StorageError.message` names only the operation and the key; provider text goes in `cause`, which is for logs. No storage error reaches the wire: the portrait image route maps `StorageNotFound` to the contract's `NotFound` and lets the other two be a 500.

## Configuration and the boot line

`storageFromConfig` in `apps/server/src/app.ts` reads `STORAGE_DRIVER`:

- **Unset** means storage is OFF. `ObjectStorage.unavailable` answers every operation with `StorageUnavailable`, and the server logs `Storage is OFF`. This is what CI and the whole suite run.
- **`filesystem`** means the local adapter over `STORAGE_FS_ROOT`, which defaults to the gitignored `apps/server/.storage`. The server logs `Storage is ON: driver filesystem at <root>`.
- **Any other value fails the boot** with a `ConfigError` naming the variable. A typo must not look like a deliberate OFF.

Every branch logs one line, as hosted sign-in and Hob do (`server.md`, _Env files_). A hosted provider's ON line may name its endpoint and bucket, but never a credential.

## The file-system adapter

`apps/server/src/storage/FileSystemStorage.ts` is built on Effect's `FileSystem` and `Path`, so it has no Node-specific code of its own.

- **Each key is a directory**, `<root>/<key>/`, holding `@meta.json` and `@data-<uuid>`. A plain file per key could not hold both `a/b` and `a/b/c`, which every object store allows.
- **The metadata rename is the commit.** `put` writes a fresh data file, then renames the metadata over `@meta.json`. The metadata names its data file, so a reader never sees new bytes under old metadata. The previous data file is removed afterwards.
- A crash, or two writers racing on one key, can leave an unreferenced `@data-*` behind. Emptied directories stay, because removing one would race a `put` that has just created it. Both are acceptable for a development directory, and are why this adapter is not a production store.
- It checks the key again before touching the disk, so a string cast to `StorageKey` still cannot leave the root.

## Adding a provider

1. **Write the adapter** as a new module in `apps/server/src/storage/`, exporting a `layer` that returns `Layer<ObjectStorage, StorageError, …>`. Read its settings from `Config` (credentials `Config.redacted`) and map every provider failure to `StorageError`, keeping the provider's error as `cause`. A missing object must be `StorageNotFound` from `get` and `None` from `head`, never a `StorageError`.
2. **Register the driver.** Add its name to the `STORAGE_DRIVER` literals in `apps/server/src/Config.ts`, add a branch to `storageFromConfig` that logs its ON line, and document its variables by name in `apps/server/.env.example`.
3. **Pass the contract.** Call `objectStorageContract(name, layer)` from `apps/server/test/support/objectStorageContract.ts` and change nothing in it. It builds the layer once and gives each test its own key prefix, so it can run against a real bucket. Behaviour that belongs to one adapter goes in that adapter's own test file. If the adapter cannot meet a contract test, change the interface for every adapter; do not skip the test.

`ObjectStorage.memory` is an in-process adapter that also passes the contract. Use it in tests of code that stores files but is not about storage.

## Key layout

Keys are derived from ids, never from anything a person typed, and never overwritten.

- **Portraits**: `portraits/{accountId}/{characterId}/{portraitId}/` holds `original.png` (the provider's bytes, untouched, so provenance credentials survive), `full.webp` (1024), `card.webp` (640) and `thumb.webp` (160). The prefix is built by `portraitPrefix` in `repo/Portraits.ts` and written to `character_portrait.storage_prefix` at insert; one `deletePrefix` removes every size, and the account segment makes an account-wide purge one more.
- **Deletion is an outbox**, `storage_deletion`, filled by a trigger when a portrait row is deleted and by a failed or interrupted draw, and drained through `deletePrefix`. A failed drain backs off a minute per attempt. See [Characters](characters.md), _The portrait_.
