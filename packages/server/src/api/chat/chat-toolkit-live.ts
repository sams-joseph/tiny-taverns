import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import type * as Tool from "effect/unstable/ai/Tool";
import type * as Toolkit from "effect/unstable/ai/Toolkit";
import { ChatMailbox, ChatToolkit } from "./chat-toolkit.js";
import { NpcRepo } from "@/db/npc-repo.js";
import { UserId } from "@app/domain/auth";
import { Option } from "effect";

export const HandlersLive = ChatToolkit.toLayer(
  Effect.gen(function* () {
    const npcRepo = yield* NpcRepo;

    return {
      fetchNpcs: Effect.fnUntraced(function* () {
        const mailbox = yield* ChatMailbox;

        yield* PubSub.publish(mailbox, [
          {
            _tag: "ToolStart",
            toolName: "fetchNpcs",
            input: "{}",
          },
        ]);

        const npcs = yield* npcRepo
          .listByUser(
            UserId.make("00000000-0000-4000-8000-000000000001"),
            Option.none(),
          )
          .pipe(
            Effect.tapError(() =>
              PubSub.publish(mailbox, [
                { _tag: "ToolFailure", toolName: "fetchNpcs" },
              ]).pipe(Effect.asVoid),
            ),
          );

        yield* PubSub.publish(mailbox, [
          {
            _tag: "ToolSuccess",
            toolName: "fetchNpcs",
            output: JSON.stringify(npcs.items),
          },
        ]);

        return npcs.items;
      }),

      createNpc: Effect.fnUntraced(function* (params) {
        const mailbox = yield* ChatMailbox;

        yield* PubSub.publish(mailbox, [
          {
            _tag: "ToolStart",
            toolName: "createNpc",
            input: JSON.stringify(params),
          },
        ]);

        const npc = yield* npcRepo
          .create({
            userId: UserId.make("00000000-0000-4000-8000-000000000001"),
            title: params.title,
          })
          .pipe(
            Effect.tapError(() =>
              PubSub.publish(mailbox, [
                { _tag: "ToolFailure", toolName: "createNpc" },
              ]).pipe(Effect.asVoid),
            ),
          );

        yield* PubSub.publish(mailbox, [
          {
            _tag: "ToolSuccess",
            toolName: "createNpc",
            output: JSON.stringify(npc),
          },
        ]);

        return npc;
      }),
    };
  }),
);

export const ChatToolkitLive: Layer.Layer<
  Tool.HandlersFor<Toolkit.Tools<typeof ChatToolkit>>
> = HandlersLive.pipe(Layer.provide(NpcRepo.layer));
