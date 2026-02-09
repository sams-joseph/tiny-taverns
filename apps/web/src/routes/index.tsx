import { createFileRoute } from "@tanstack/react-router";
import { chatAtom, chatHistoryAtom } from "../atoms/atom";
import { useAtom, useAtomValue } from "@effect-atom/atom-react";
import type { Prompt } from "@effect/ai";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Message({ message }: { message: Prompt.Message }) {
  if (message.role === "tool") {
    return (
      <div className="flex flex-col justify-start text-muted-foreground text-sm">
        {message.content.map((part) => (
          <span key={part.id} className="block">
            Tool call "{part.name}"
          </span>
        ))}
      </div>
    );
  }

  if (message.role === "user" || message.role === "assistant") {
    return (
      <div
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
    );
  }

  return <div>System</div>;
}

function Index() {
  const [input, setInput] = useState("");
  const [chat, setChat] = useAtom(chatAtom);
  const result = useAtomValue(chatHistoryAtom);
  const messages = result.content;

  const handleChat = () => {
    setChat({ text: input });
    setInput("");
  };

  return (
    <div className="p-2">
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleChat}>Chat</button>
      <div className="space-y-4">
        {/* {messages.filter(isVisualMessage).map((message, i) => */}
        {messages.map((message, i) => (
          <Message key={i} message={message} />
        ))}
        {chat.waiting && <div>Thinking...</div>}
      </div>
    </div>
  );
}
