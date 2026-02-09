import { createFileRoute } from "@tanstack/react-router";
import { chatAtom, chatPartsAtom } from "../atoms/atom";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import type { Prompt } from "@effect/ai";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

const isVisualMessage = (
  message: Prompt.Message,
): message is Prompt.UserMessage | Prompt.UserMessage | Prompt.ToolMessage => {
  if (message.role === "system") return false;
  return message.content.some(isVisualPart);
};

const isVisualPart = (
  part:
    | Prompt.UserMessagePart
    | Prompt.AssistantMessagePart
    | Prompt.ToolMessagePart,
): boolean => part.type === "text" || part.type === "tool-result";

function Index() {
  const [input, setInput] = useState("");
  const chat = useAtomSet(chatAtom);
  const result = useAtomValue(chatPartsAtom);
  const messages = result.content;

  const handleChat = () => {
    chat({ text: input });
    setInput("");
  };

  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleChat}>Chat</button>
      <div className="space-y-4">
        {messages.filter(isVisualMessage).map((message, i) =>
          message.role === "tool" ? (
            <div
              key={i}
              className="flex flex-col justify-start text-muted-foreground text-sm"
            >
              {message.content.map((part) => (
                <span key={part.id} className="block">
                  Tool call "{part.name}"
                </span>
              ))}
            </div>
          ) : (
            <div
              key={i}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-4 py-2 prose dark:prose-invert leading-tight overflow-auto ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted dark:bg-border text-foreground"
                }`}
              >
                {message.content
                  .filter((_) => _.type === "text")
                  .map((part) => (part.type === "text" ? part.text : ""))}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
