import { NpcModel } from "@/db/npc-model.js";
import { NpcRepo } from "@/db/npc-repo.js";
import { CurrentUser } from "@app/domain/auth";
import { Option } from "effect";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import type * as Tool from "effect/unstable/ai/Tool";
import type * as Toolkit from "effect/unstable/ai/Toolkit";
import { ChatMailbox, ChatRunContext, ChatToolkit } from "./chat-toolkit.js";

export const HandlersLive = ChatToolkit.toLayer(
  Effect.gen(function*() {
    const npcRepo = yield* NpcRepo;

    return {
      fetchNpcs: Effect.fnUntraced(function*() {
        const mailbox = yield* ChatMailbox;
        const ctx = yield* ChatRunContext;
        const currentUser = yield* CurrentUser;

        yield* PubSub.publish(mailbox, [
          {
            _tag: "ToolStart",
            toolName: "fetchNpcs",
            input: "{}",
          },
        ]);

        const npcs = yield* npcRepo
          .fetch(currentUser.id, ctx.campaignId, Option.none())
          .pipe(
            Effect.tapError(() =>
              PubSub.publish(mailbox, [
                { _tag: "ToolFailure", toolName: "fetchNpcs" },
              ]).pipe(Effect.asVoid)
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

      createNpc: Effect.fnUntraced(function*(params) {
        const mailbox = yield* ChatMailbox;
        const ctx = yield* ChatRunContext;
        const currentUser = yield* CurrentUser;

        yield* PubSub.publish(mailbox, [
          {
            _tag: "ToolStart",
            toolName: "createNpc",
            input: JSON.stringify(params),
          },
        ]);

        const npc = yield* npcRepo
          .insert(
            NpcModel.insert.make({
              userId: currentUser.id,
              campaignId: ctx.campaignId,
              title: params.title,
            }),
          )
          .pipe(
            Effect.tapError(() =>
              PubSub.publish(mailbox, [
                { _tag: "ToolFailure", toolName: "createNpc" },
              ]).pipe(Effect.asVoid)
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
  Tool.HandlersFor<Toolkit.Tools<typeof ChatToolkit>>,
  never,
  NpcRepo
> = HandlersLive;
