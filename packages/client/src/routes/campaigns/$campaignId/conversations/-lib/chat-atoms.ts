import { ModelFamily } from "@app/domain/ai-models";
import { CampaignId } from "@app/domain/api/campaign-rpc";
import { ChatId, RunId } from "@app/domain/api/chat-rpc";
import type { ChatEvent, Message } from "@app/domain/api/chat-rpc";
import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as KeyValueStore from "effect/unstable/persistence/KeyValueStore";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Atom from "effect/unstable/reactivity/Atom";
import { accumulateEvent, extractText } from "./chat-accumulator.js";
import { ChatApi } from "./chat-api.js";
import type { ContentBlock, StreamState, ToolStatus, UIMessage } from "./chat-types.js";

export const chatRuntime = Atom.runtime(ChatApi.layer);
const preferencesLayer: Layer.Layer<KeyValueStore.KeyValueStore> =
  BrowserKeyValueStore.layerLocalStorage;
export const preferencesRuntime = Atom.runtime(preferencesLayer);

type LocalTranscript =
  | { readonly _tag: "None"; }
  | { readonly _tag: "Deleted"; }
  | {
    readonly _tag: "Sending";
    readonly assistantMsgId: string;
    readonly messages: readonly UIMessage[];
  }
  | {
    readonly _tag: "Streaming";
    readonly runId: RunId;
    readonly assistantMsgId: string;
    readonly messages: readonly UIMessage[];
  }
  | {
    readonly _tag: "Overlay";
    readonly reason: "interrupted" | "failure" | "completion-race";
    readonly runId: RunId | null;
    readonly assistantMsgId: string | null;
    readonly messages: readonly UIMessage[];
  };

const localNone: LocalTranscript = { _tag: "None" };
const localDeleted: LocalTranscript = { _tag: "Deleted" };

type ConversationKey = {
  readonly campaignId: CampaignId;
  readonly chatId: ChatId;
};

export const selectedModelAtom = Atom.kvs({
  runtime: preferencesRuntime,
  key: "@app/chat/selected-model",
  schema: ModelFamily,
  defaultValue: () => "qwen3-0.6b" as const,
});

export const convertPersistedMessages = (
  messages: ReadonlyArray<Message>,
): readonly UIMessage[] => {
  const result: UIMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i]!;

    if (msg.role === "user") {
      const content = typeof msg.content === "string"
        ? msg.content
        : msg.content
          .filter(
            (part): part is typeof part & { type: "text"; } => part.type === "text",
          )
          .map((part) => part.text)
          .join("");
      result.push({
        id: crypto.randomUUID(),
        role: "user",
        content,
        contentBlocks: [],
        error: null,
      });
      i++;
      continue;
    }

    const contentBlocks: ContentBlock[] = [];

    while (i < messages.length && messages[i]!.role !== "user") {
      const current = messages[i]!;

      if (current.role === "assistant") {
        const toolResults = new Map<
          string,
          { readonly result: Schema.Json; readonly isFailure: boolean; }
        >();
        const nextMsg = messages[i + 1];
        if (
          nextMsg
          && nextMsg.role === "tool"
          && typeof nextMsg.content !== "string"
        ) {
          for (const part of nextMsg.content) {
            if (part.type === "tool-result") {
              toolResults.set(part.id, {
                result: part.result,
                isFailure: part.isFailure,
              });
            }
          }
        }

        if (typeof current.content === "string") {
          if (current.content) {
            contentBlocks.push({ _tag: "text", content: current.content });
          }
        } else {
          for (const part of current.content) {
            if (part.type === "text") {
              const last = contentBlocks[contentBlocks.length - 1];
              if (last && last._tag === "text") {
                contentBlocks[contentBlocks.length - 1] = {
                  _tag: "text",
                  content: last.content + part.text,
                };
              } else if (part.text) {
                contentBlocks.push({ _tag: "text", content: part.text });
              }
            } else if (part.type === "tool-call") {
              const toolResult = toolResults.get(part.id);
              const tool: ToolStatus = {
                id: part.id,
                toolName: part.name,
                status: toolResult
                  ? toolResult.isFailure
                    ? "failure"
                    : "success"
                  : "start",
                input: typeof part.params === "string"
                  ? part.params
                  : JSON.stringify(part.params, null, 2),
                output: toolResult
                  ? typeof toolResult.result === "string"
                    ? toolResult.result
                    : JSON.stringify(toolResult.result, null, 2)
                  : null,
              };
              const last = contentBlocks[contentBlocks.length - 1];
              if (last && last._tag === "tool_group") {
                contentBlocks[contentBlocks.length - 1] = {
                  _tag: "tool_group",
                  tools: [...last.tools, tool],
                };
              } else {
                contentBlocks.push({ _tag: "tool_group", tools: [tool] });
              }
            }
          }
        }
      }

      i++;
    }

    result.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: extractText(contentBlocks),
      contentBlocks,
      error: null,
    });
  }

  return result;
};

const localTranscriptFamily = Atom.family((_key: ConversationKey) =>
  Atom.make<LocalTranscript>(localNone).pipe(Atom.setIdleTTL("1 minute"))
);

export const inputFamily = Atom.family((_key: ConversationKey) =>
  Atom.make("").pipe(Atom.setIdleTTL("1 day"))
);

export const chatDataFamily = Atom.family((key: ConversationKey) =>
  chatRuntime.atom(
    Effect.gen(function*() {
      const api = yield* ChatApi;
      return yield* api.chatGet(key);
    }),
  )
);

const chatViewFamily = Atom.family((key: ConversationKey) =>
  Atom.readable((get) => {
    const local = get(localTranscriptFamily(key));
    switch (local._tag) {
      case "Deleted":
        return { messages: [], generating: false } as const;
      case "Sending":
        return { messages: local.messages, generating: true } as const;
      case "Streaming":
        return { messages: local.messages, generating: true } as const;
      case "Overlay":
        return { messages: local.messages, generating: false } as const;
      case "None": {
        const chatResult = get(chatDataFamily(key));
        if (!AsyncResult.isSuccess(chatResult)) {
          return { messages: [], generating: false } as const;
        }
        return {
          messages: convertPersistedMessages(chatResult.value.messages),
          generating: chatResult.value.activeRunId !== null,
        } as const;
      }
    }
  })
);

export const messagesFamily = Atom.family((key: ConversationKey) =>
  Atom.make((get) => get(chatViewFamily(key)).messages)
);

export const generatingFamily = Atom.family((key: ConversationKey) =>
  Atom.make((get) => get(chatViewFamily(key)).generating)
);

const appendAssistantPlaceholder = ({
  messages,
}: {
  readonly messages: readonly UIMessage[];
}) => {
  const assistantMsgId = crypto.randomUUID();
  const assistant: UIMessage = {
    id: assistantMsgId,
    role: "assistant",
    content: "",
    contentBlocks: [],
    error: null,
  };
  return {
    assistantMsgId,
    messages: [...messages, assistant],
  };
};

const updateAssistantMessage = ({
  messages,
  assistantMsgId,
  updater,
}: {
  readonly messages: readonly UIMessage[];
  readonly assistantMsgId: string;
  readonly updater: (message: UIMessage) => UIMessage;
}) => messages.map((message) => message.id === assistantMsgId ? updater(message) : message);

const makeStreamingTranscript = ({
  runId,
  messages,
}: {
  readonly runId: RunId;
  readonly messages: readonly UIMessage[];
}): LocalTranscript => {
  const next = appendAssistantPlaceholder({ messages });
  return {
    _tag: "Streaming",
    runId,
    assistantMsgId: next.assistantMsgId,
    messages: next.messages,
  };
};

const makeInterruptedOverlay = ({
  local,
}: {
  readonly local: Extract<LocalTranscript, { readonly _tag: "Streaming"; }>;
}): LocalTranscript => ({
  _tag: "Overlay",
  reason: "interrupted",
  runId: local.runId,
  assistantMsgId: local.assistantMsgId,
  messages: updateAssistantMessage({
    messages: local.messages,
    assistantMsgId: local.assistantMsgId,
    updater: (message) => ({
      ...message,
      content: message.content || "(interrupted)",
    }),
  }),
});

const makeFailureOverlay = ({
  local,
  cause,
}: {
  readonly local: Extract<LocalTranscript, { readonly _tag: "Streaming"; }>;
  readonly cause: Cause.Cause<unknown>;
}): LocalTranscript => ({
  _tag: "Overlay",
  reason: "failure",
  runId: local.runId,
  assistantMsgId: local.assistantMsgId,
  messages: updateAssistantMessage({
    messages: local.messages,
    assistantMsgId: local.assistantMsgId,
    updater: (message) => ({ ...message, error: cause }),
  }),
});

const makeCompletionRaceOverlay = ({
  local,
}: {
  readonly local: Extract<LocalTranscript, { readonly _tag: "Streaming"; }>;
}): LocalTranscript => ({
  _tag: "Overlay",
  reason: "completion-race",
  runId: local.runId,
  assistantMsgId: local.assistantMsgId,
  messages: local.messages,
});

const refreshChat = Effect.fnUntraced(function*({
  get,
  key,
}: {
  readonly get: Atom.FnContext;
  readonly key: ConversationKey;
}) {
  get.refresh(chatDataFamily(key));
  return yield* get.result(chatDataFamily(key), { suspendOnWaiting: true });
});

const loadAuthoritativeMessages = Effect.fnUntraced(function*({
  get,
  key,
  forceRefresh,
}: {
  readonly get: Atom.FnContext;
  readonly key: ConversationKey;
  readonly forceRefresh: boolean;
}) {
  if (!forceRefresh) {
    const chatResult = get(chatDataFamily(key));
    if (AsyncResult.isSuccess(chatResult)) {
      return convertPersistedMessages(chatResult.value.messages);
    }
  }
  const chat = yield* refreshChat({ get, key });
  return convertPersistedMessages(chat.messages);
});

const runStream = Effect.fnUntraced(function*({
  get,
  key,
  runId,
}: {
  readonly get: Atom.FnContext;
  readonly key: ConversationKey;
  readonly runId: RunId;
}) {
  const api = yield* ChatApi;

  let state: StreamState = { contentBlocks: [] };

  yield* api.chatEvents({ campaignId: key.campaignId, runId }).pipe(
    Stream.runForEach((event: ChatEvent) =>
      Effect.sync(() => {
        const local = get(localTranscriptFamily(key));
        if (local._tag !== "Streaming" || local.runId !== runId) {
          return;
        }

        state = accumulateEvent(state, event);
        const messages = updateAssistantMessage({
          messages: local.messages,
          assistantMsgId: local.assistantMsgId,
          updater: (message) => ({
            ...message,
            content: extractText(state.contentBlocks),
            contentBlocks: state.contentBlocks,
          }),
        });

        get.set(localTranscriptFamily(key), {
          ...local,
          messages,
        });
      })
    ),
    Effect.onExit(
      Exit.match({
        onSuccess: () =>
          Effect.gen(function*() {
            const local = get(localTranscriptFamily(key));
            if (local._tag !== "Streaming" || local.runId !== runId) {
              return;
            }

            const refreshExit = yield* Effect.exit(
              refreshChat({ get, key }),
            );
            if (refreshExit._tag === "Failure") {
              get.set(
                localTranscriptFamily(key),
                makeCompletionRaceOverlay({ local }),
              );
              return;
            }

            if (refreshExit.value.activeRunId === runId) {
              get.set(
                localTranscriptFamily(key),
                makeCompletionRaceOverlay({ local }),
              );
              return;
            }

            if (refreshExit.value.activeRunId !== null) {
              get.set(
                localTranscriptFamily(key),
                makeStreamingTranscript({
                  runId: refreshExit.value.activeRunId,
                  messages: convertPersistedMessages(
                    refreshExit.value.messages,
                  ),
                }),
              );
              get.mount(attachRunFamily(key));
              get.set(attachRunFamily(key), {
                runId: refreshExit.value.activeRunId,
              });
              return;
            }

            get.set(localTranscriptFamily(key), localNone);
          }),
        onFailure: (cause) =>
          Effect.sync(() => {
            const local = get(localTranscriptFamily(key));
            if (local._tag !== "Streaming" || local.runId !== runId) {
              return;
            }

            get.set(
              localTranscriptFamily(key),
              Cause.hasInterruptsOnly(cause)
                ? makeInterruptedOverlay({ local })
                : makeFailureOverlay({ local, cause }),
            );
            get.refresh(chatDataFamily(key));
          }),
      }),
    ),
  );
});

const attachRunFamily = Atom.family((key: ConversationKey) =>
  chatRuntime
    .fn<{ runId: RunId; }>()(
      Effect.fnUntraced(function*({ runId }, get) {
        yield* runStream({ get, key, runId });
      }),
    )
    .pipe(Atom.setIdleTTL("1 minute"))
);

const prepareSend = Effect.fnUntraced(function*({
  get,
  key,
  message,
}: {
  readonly get: Atom.FnContext;
  readonly key: ConversationKey;
  readonly message: string;
}) {
  const local = get(localTranscriptFamily(key));
  if (
    local._tag === "Sending"
    || local._tag === "Streaming"
    || local._tag === "Deleted"
  ) {
    return Option.none<RunId>();
  }

  const baseMessages = yield* loadAuthoritativeMessages({
    get,
    key,
    forceRefresh: local._tag === "Overlay",
  });

  const api = yield* ChatApi;
  const userMsg: UIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    contentBlocks: [],
    error: null,
  };
  const optimistic = appendAssistantPlaceholder({
    messages: [...baseMessages, userMsg],
  });

  get.set(localTranscriptFamily(key), {
    _tag: "Sending",
    assistantMsgId: optimistic.assistantMsgId,
    messages: optimistic.messages,
  });

  const askExit = yield* Effect.exit(api.chatAsk({ ...key, message }));
  if (askExit._tag === "Failure") {
    get.set(localTranscriptFamily(key), localNone);
    return yield* Effect.failCause(askExit.cause);
  }

  const latestLocal = get(localTranscriptFamily(key));
  if (
    latestLocal._tag !== "Sending"
    || latestLocal.assistantMsgId !== optimistic.assistantMsgId
  ) {
    if (latestLocal._tag !== "Deleted") {
      yield* api.chatInterrupt(key).pipe(Effect.ignore);
    }
    return Option.none<RunId>();
  }

  get.set(localTranscriptFamily(key), {
    _tag: "Streaming",
    runId: askExit.value.runId,
    assistantMsgId: optimistic.assistantMsgId,
    messages: optimistic.messages,
  });
  get.set(inputFamily(key), "");

  return Option.some(askExit.value.runId);
});

export const sendMessageFamily = Atom.family((key: ConversationKey) =>
  chatRuntime
    .fn<{ message: string; }>()(
      Effect.fnUntraced(function*({ message }, get) {
        const runId = yield* prepareSend({ get, key, message });
        if (Option.isNone(runId)) {
          return;
        }
        yield* runStream({ get, key, runId: runId.value });
      }),
      { concurrent: true },
    )
    .pipe(Atom.setIdleTTL("1 minute"))
);

export const watchChatFamily = Atom.family((key: ConversationKey) =>
  chatRuntime
    .fn<{ activeRunId: RunId | null; }>()(
      Effect.fnUntraced(function*({ activeRunId }, get) {
        const api = yield* ChatApi;

        get.mount(attachRunFamily(key));
        get.addFinalizer(() => {
          get.set(attachRunFamily(key), Atom.Interrupt);
        });

        const attach = Effect.fnUntraced(function*({
          runId,
        }: {
          readonly runId: RunId;
        }) {
          const localBefore = get(localTranscriptFamily(key));
          if (
            localBefore._tag === "Sending"
            || localBefore._tag === "Streaming"
          ) {
            return;
          }
          if (
            localBefore._tag === "Overlay"
            && localBefore.runId === runId
            && localBefore.assistantMsgId !== null
          ) {
            get.set(localTranscriptFamily(key), {
              _tag: "Streaming",
              runId,
              assistantMsgId: localBefore.assistantMsgId,
              messages: localBefore.messages,
            });
            get.set(attachRunFamily(key), { runId });
            return;
          }

          const chat = yield* api.chatGet(key);
          const localAfter = get(localTranscriptFamily(key));
          if (
            localAfter._tag === "Sending"
            || localAfter._tag === "Streaming"
          ) {
            return;
          }
          if (chat.activeRunId !== runId) {
            return;
          }

          get.set(
            localTranscriptFamily(key),
            makeStreamingTranscript({
              runId,
              messages: convertPersistedMessages(chat.messages),
            }),
          );
          get.set(attachRunFamily(key), { runId });
        });

        if (activeRunId !== null) {
          yield* attach({ runId: activeRunId });
        }

        yield* api.chatWatch(key).pipe(
          Stream.runForEach((event) =>
            event.runId === null
              ? Effect.gen(function*() {
                const refreshExit = yield* Effect.exit(
                  refreshChat({ get, key }),
                );
                if (refreshExit._tag === "Failure") {
                  return;
                }
                if (refreshExit.value.activeRunId !== null) {
                  return;
                }

                const local = get(localTranscriptFamily(key));
                if (
                  local._tag === "Overlay"
                  && local.reason === "completion-race"
                ) {
                  get.set(localTranscriptFamily(key), localNone);
                }
              })
              : attach({ runId: event.runId })
          ),
        );
      }),
    )
    .pipe(Atom.setIdleTTL("1 minute"))
);

export const chatListFamily = Atom.family((campaignId: CampaignId) =>
  chatRuntime.atom(
    Effect.gen(function*() {
      const api = yield* ChatApi;
      return yield* api.chatList({ campaignId, cursor: null });
    }),
  )
);

export const createChatAtom = chatRuntime.fn(
  Effect.fnUntraced(function*({
    campaignId,
    title,
    model,
  }: {
    readonly campaignId: CampaignId;
    readonly title: string;
    readonly model: typeof ModelFamily.Type;
  }) {
    const api = yield* ChatApi;
    return yield* api.chatCreate({ campaignId, title, model });
  }),
);

export const deleteChatFamily = Atom.family((key: ConversationKey) =>
  chatRuntime
    .fn<void>()(
      Effect.fnUntraced(function*(_, get) {
        const api = yield* ChatApi;
        yield* api.chatDelete(key);
        get.set(attachRunFamily(key), Atom.Interrupt);
        get.set(watchChatFamily(key), Atom.Interrupt);
        get.set(inputFamily(key), "");
        get.set(localTranscriptFamily(key), localDeleted);
      }),
    )
    .pipe(Atom.setIdleTTL("1 minute"))
);

export const interruptFamily = Atom.family((key: ConversationKey) =>
  chatRuntime.fn<void>()(
    Effect.fnUntraced(function*(_, get) {
      get.set(attachRunFamily(key), Atom.Interrupt);

      const local = get(localTranscriptFamily(key));
      if (local._tag === "Sending") {
        get.set(localTranscriptFamily(key), localNone);
        return;
      }

      if (local._tag === "Streaming") {
        get.set(
          localTranscriptFamily(key),
          makeInterruptedOverlay({ local }),
        );
      }

      const api = yield* ChatApi;
      yield* api.chatInterrupt(key);
    }),
  )
);
