import type { CampaignId } from "@app/domain/api/campaign-rpc";
import type { ChatId } from "@app/domain/api/chat-rpc";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { Loader2Icon } from "lucide-react";
import * as React from "react";
import { chatDataFamily, watchChatFamily } from "./chat-atoms.js";
import { ChatInput } from "./chat-input.js";
import { MessageList } from "./message-list.js";

export const ChatPage = ({
  campaignId,
  chatId,
}: {
  readonly campaignId: CampaignId;
  readonly chatId: ChatId;
}) => {
  const conversationKey = React.useMemo(
    () => ({ campaignId, chatId }),
    [campaignId, chatId],
  );
  const chatAtom = chatDataFamily(conversationKey);
  const watchAtom = watchChatFamily(conversationKey);
  const chatResult = useAtomValue(chatAtom);
  const watchResult = useAtomValue(watchAtom);
  const setWatchChat = useAtomSet(watchAtom);

  const activeRunId = AsyncResult.isSuccess(chatResult)
    ? chatResult.value.activeRunId
    : undefined;

  React.useEffect(() => {
    if (activeRunId === undefined) {
      return;
    }
    if (
      !AsyncResult.isInitial(watchResult)
      && !AsyncResult.isFailure(watchResult)
    ) {
      return;
    }
    setWatchChat({ activeRunId });
  }, [activeRunId, setWatchChat, watchResult]);

  if (
    AsyncResult.isInitial(chatResult)
    || (chatResult.waiting && !AsyncResult.isSuccess(chatResult))
  ) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  if (AsyncResult.isFailure(chatResult)) {
    return (
      <div className="flex-1 flex items-center justify-center text-danger">
        <p>Failed to load Conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-full max-w-4xl mx-auto">
      <MessageList conversationKey={conversationKey} />
      <ChatInput conversationKey={conversationKey} />
    </div>
  );
};
