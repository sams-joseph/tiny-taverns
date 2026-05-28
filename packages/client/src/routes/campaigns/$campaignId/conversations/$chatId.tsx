import { CampaignId } from "@app/domain/api/campaign-rpc";
import { ChatId } from "@app/domain/api/chat-rpc";
import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "./-lib/chat-page.js";

const ConversationPage = () => {
  const { campaignId, chatId } = Route.useParams();
  return (
    <ChatPage
      campaignId={CampaignId.make(campaignId)}
      chatId={ChatId.make(chatId)}
    />
  );
};

export const Route = createFileRoute(
  "/campaigns/$campaignId/conversations/$chatId",
)({
  component: ConversationPage,
});
