import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { OpenAiLanguageModel } from "@effect/ai-openai";

import { Chat } from "@effect/ai";
import * as Prompt from "@effect/ai/Prompt";
import { toolkit } from "@repo/domain/Toolkit";
import { MonstersRepository } from "../MonstersRepository.js";
import { CampaignsRepository } from "../CampaignsRepository.js";
import { Mailbox, Ref } from "effect";
import { StreamPart } from "@effect/ai/Response";
import { EncountersRepository } from "../EncountersRepository.js";
import { SessionsRepository } from "../SessionsRepository.js";
import {
  SessionId,
  SessionNote,
  SessionMetadataChunk,
  ChatStreamPart,
} from "@repo/domain";

const ToolkitLayer = toolkit.toLayer(
  Effect.gen(function* () {
    const monsters = yield* MonstersRepository;
    const campaigns = yield* CampaignsRepository;
    const encounters = yield* EncountersRepository;

    return toolkit.of({
      SearchMonsters: Effect.fnUntraced(function* ({ query }) {
        const results = yield* monsters.findAll({ search: query });

        return { _tag: "Transient", value: results } as const;
      }),
      CreateMonster: Effect.fnUntraced(function* ({ monster }) {
        const newMonster = yield* monsters.create(monster);

        return {
          _tag: "Transient",
          value: { monsterId: newMonster.id },
        };
      }),
      CreateCampaign: Effect.fnUntraced(function* ({ campaign }) {
        const newCampaign = yield* campaigns.create(campaign);

        return {
          _tag: "Transient",
          value: { campaignId: newCampaign.id },
        };
      }),
      SearchCampaigns: Effect.fnUntraced(function* ({ query }) {
        const results = yield* campaigns.findAll({ search: query });

        return { _tag: "Transient", value: results } as const;
      }),
      CreateEncounter: Effect.fnUntraced(function* ({ encounter }) {
        const newEncounter = yield* encounters.create(encounter);

        return {
          _tag: "Transient",
          value: { encounterId: newEncounter.id },
        };
      }),
    });
  }),
);

export class AiChatService extends Effect.Service<AiChatService>()(
  "api/lib/AiChatService",
  {
    dependencies: [ToolkitLayer, SessionsRepository.Default],
    scoped: Effect.gen(function* () {
      const sessions = yield* SessionsRepository;
      // TODO: Make this an env variable
      const model = yield* OpenAiLanguageModel.model("qwen3-0.6b", {
        reasoning: { effort: "medium" },
      });

      const tools = yield* toolkit;

      const baseSystemPrompt = `You are an AI assistant whose role is to support a Dungeon Master (DM) running a Dungeons & Dragons campaign.

## Tools

You have access to some tools that can be used to look up information about the user's monsters, and campaigns.

- Prefer using tools to show information rather than providing it directly.
- Always try to create monsters, campaigns, and encounters using the appropriate tool when the user requests it.
- When creating encounters, use the search campaigns tool to find the relevant campaign, and include that information in the encounter creation.
- Use \`SearchCampaigns\` for getting the current campaign. For example "Create an encounter for this campaign?"

*Important:*

Avoid providing information that is already available in the app.

- If the user is viewing a recipe, do not repeat the recipe details in your response.
- If you scale the recipe, only confirm the new scale and don't list out all ingredients again.

You exist to make the DM's job easier, faster, and more fun, while keeping the story player-driven and memorable.`;

      const runAgentLoop = (
        chat: Chat.Service,
        mailbox: Mailbox.Mailbox<typeof ChatStreamPart.Type>,
        sessionId: SessionId,
      ) =>
        Effect.iterate(
          {
            finishReason: "tool-calls",
            iteration: 0,
          },
          {
            while: (state) =>
              state.finishReason === "tool-calls" && state.iteration < 8,
            body: (state) =>
              Effect.gen(function* () {
                const iteration = state.iteration + 1;
                const finishReason = yield* Effect.gen(function* () {
                  const finishReasonRef = yield* Ref.make("stop");
                  const assistantTextChunks: string[] = [];

                  yield* chat
                    .streamText({
                      prompt: [],
                      toolkit: tools,
                    })
                    .pipe(
                      Stream.runForEach((chunk) =>
                        Effect.gen(function* () {
                          // TODO: This logic for continuing the loop needs work.
                          // We want to continue the loop if any tool calls are made
                          if (chunk.type === "tool-call") {
                            yield* Ref.set(finishReasonRef, "tool-calls");

                            // Log tool call as session note
                            const toolCallNote = new SessionNote({
                              timestamp: new Date().toISOString(),
                              type: "tool",
                              content: chunk.name,
                              metadata: {
                                chunk: JSON.parse(JSON.stringify(chunk)),
                              },
                            });
                            yield* sessions.addNote(sessionId, toolCallNote);
                          } else if (chunk.type === "tool-result") {
                            // Log tool result as session note
                            const toolResultNote = new SessionNote({
                              timestamp: new Date().toISOString(),
                              type: "tool_result",
                              content: chunk.name,
                              metadata: {
                                chunk: JSON.parse(JSON.stringify(chunk)),
                              },
                            });
                            yield* sessions.addNote(sessionId, toolResultNote);
                          } else if (chunk.type === "text-delta") {
                            // Accumulate text chunks
                            assistantTextChunks.push(chunk.delta);
                          }

                          yield* mailbox.offer(
                            chunk as typeof ChatStreamPart.Type,
                          );
                        }),
                      ),
                      Stream.runDrain,
                    );

                  // After stream completes, log accumulated assistant text
                  if (assistantTextChunks.length > 0) {
                    const assistantNote = new SessionNote({
                      timestamp: new Date().toISOString(),
                      type: "assistant",
                      content: assistantTextChunks.join(""),
                    });
                    yield* sessions.addNote(sessionId, assistantNote);
                  }

                  return yield* Ref.get(finishReasonRef);
                });

                return {
                  finishReason,
                  iteration,
                };
              }),
          },
        );

      const send = Effect.fnUntraced(function* (options: {
        messages: Prompt.Prompt;
        sessionId?: SessionId;
      }) {
        // Ensure we have a session to store notes
        const sessionId = options.sessionId ?? (yield* sessions.create({})).id;

        // Store the entire prompt as a session note
        const promptNote = new SessionNote({
          timestamp: new Date().toISOString(),
          type: "user",
          content: JSON.stringify(options.messages),
        });
        yield* sessions.addNote(sessionId, promptNote);

        const mailbox = yield* Mailbox.make<typeof ChatStreamPart.Type>();

        const systemPrompt = Prompt.make([
          {
            role: "system",
            content: baseSystemPrompt,
          },
        ]);

        const prompt = Prompt.merge(systemPrompt, options.messages);
        const chat = yield* Chat.fromPrompt(prompt);

        yield* Effect.forkScoped(
          Effect.gen(function* () {
            // Emit session metadata first
            yield* mailbox.offer(
              new SessionMetadataChunk({ type: "session-metadata", sessionId }),
            );
            yield* runAgentLoop(chat, mailbox, sessionId);
          }).pipe(Effect.ensuring(mailbox.end)),
        );

        return mailbox;
      }, Effect.provide(model));

      return { send } as const;
    }),
  },
) {}
