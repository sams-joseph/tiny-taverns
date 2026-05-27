import { ChatId } from "@app/domain/api/chat-rpc";
import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "./-lib/chat-page.js";

const ConversationPage = () => {
  const { chatId } = Route.useParams();
  return <ChatPage chatId={ChatId.make(chatId)} />;
};

export const Route = createFileRoute(
  "/campaigns/$campaignId/conversations/$chatId",
)({
  component: ConversationPage,
});
