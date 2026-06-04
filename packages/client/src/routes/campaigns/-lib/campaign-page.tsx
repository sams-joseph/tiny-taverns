import { Button } from "@/components/ui/button.js";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import { CampaignId } from "@app/domain/api/campaign-rpc";
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { Array, Option, pipe } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  BookOpenIcon,
  Loader2Icon,
  MessageSquareIcon,
  PlusIcon,
  ScrollTextIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import * as React from "react";
import {
  chatListFamily,
  createChatAtom,
  selectedModelAtom,
} from "../$campaignId/conversations/-lib/chat-atoms.js";
import { campaignDataFamily } from "../-lib/campaign-atoms.js";

export const Route = createFileRoute("/campaigns/$campaignId/")({
  component: CampaignLayout,
});

function CampaignLayout() {
  return <Outlet />;
}

export function CampaignOverviewPage() {
  const navigate = useNavigate();
  const { campaignId } = Route.useParams();
  const currentCampaignId = React.useMemo(
    () => CampaignId.make(campaignId),
    [campaignId],
  );
  const conversationsAtom = React.useMemo(
    () => chatListFamily(currentCampaignId),
    [currentCampaignId],
  );
  const campaign = useAtomValue(campaignDataFamily(currentCampaignId));
  const conversations = useAtomValue(conversationsAtom);
  const refreshConversations = useAtomRefresh(conversationsAtom);
  const createConversation = useAtomSet(createChatAtom, { mode: "promise" });
  const selectedModel = useAtomValue(selectedModelAtom);

  const initialChat = React.useMemo(() => {
    return pipe(
      Array.head(
        AsyncResult.isSuccess(conversations) ? conversations.value.items : [],
      ),
      Option.getOrElse(() => null),
    );
  }, [conversations]);

  const handleCreateConversation = () => {
    void createConversation({
      campaignId: currentCampaignId,
      title: "New Conversation",
      model: selectedModel,
    }).then((conversation) => {
      refreshConversations();
      void navigate({
        to: "/campaigns/$campaignId/conversations/$chatId",
        params: {
          campaignId: currentCampaignId,
          chatId: conversation.id,
        },
      });
    });
  };

  if (AsyncResult.isInitial(campaign) || campaign.waiting) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted" />
      </div>
    );
  }

  if (AsyncResult.isFailure(campaign)) {
    return <div className="p-6 text-danger">Failed to load Campaign</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {initialChat && (
          <Button
            onClick={() =>
              navigate({
                to: "/campaigns/$campaignId/conversations/$chatId",
                params: {
                  campaignId: campaign.value.id,
                  chatId: initialChat?.id,
                },
              })}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          >
            <MessageSquareIcon className="size-4" />
            Open General Conversation
          </Button>
        )}
        <Button
          onClick={handleCreateConversation}
          variant="outline"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2"
        >
          <PlusIcon className="size-4" />
          New Conversation
        </Button>
      </div>

      {
        /* <Card className="w-full">
        <CardHeader>
          <CardTitle>Conversations</CardTitle>
          <CardDescription>
            Prep, play, recap, and worldbuilding threads inside this Campaign.
          </CardDescription>
          <CardAction>
            <MessageSquareIcon className="size-4" />
          </CardAction>
        </CardHeader>
        <div className="grid gap-2 px-6 pb-6">
          {AsyncResult.isInitial(conversations) || conversations.waiting
            ? (
              <div className="flex justify-center py-4">
                <Loader2Icon className="size-5 animate-spin text-muted" />
              </div>
            )
            : AsyncResult.isFailure(conversations)
            ? <p className="text-sm text-danger">Failed to load Conversations</p>
            : conversations.value.items.length === 0
            ? <p className="text-sm text-muted">No Conversations yet.</p>
            : (
              conversations.value.items.map((conversation) => (
                <Button
                  key={conversation.id}
                  variant="ghost"
                  className="justify-start"
                  onClick={() =>
                    navigate({
                      to: "/campaigns/$campaignId/conversations/$chatId",
                      params: {
                        campaignId: currentCampaignId,
                        chatId: conversation.id,
                      },
                    })}
                >
                  {conversation.title}
                </Button>
              ))
            )}
        </div>
      </Card> */
      }

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <OverviewCard
          icon={<MessageSquareIcon className="size-5" />}
          title="Conversations"
          description="Prep, play, recap, and worldbuilding threads."
        />
        <Link
          to="/campaigns/$campaignId/npcs"
          params={{ campaignId: campaign.value.id }}
        >
          <OverviewCard
            icon={<UsersIcon className="size-5" />}
            title="NPCs"
            description="Campaign-scoped cast members."
          />
        </Link>
        <OverviewCard
          icon={<BookOpenIcon className="size-5" />}
          title="Campaign Notes"
          description="House rules, factions, secrets, and history."
        />
        <OverviewCard
          icon={<SparklesIcon className="size-5" />}
          title="Pending Updates"
          description="Unresolved Campaign Update Proposals."
        />
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Unresolved Campaign Update Proposals</CardTitle>
          <CardDescription>No unresolved proposals yet.</CardDescription>
          <CardAction>
            <ScrollTextIcon className="size-4" />
          </CardAction>
        </CardHeader>
      </Card>
      {
        /* <section className="rounded-2xl border border-border bg-elevated p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <ScrollTextIcon className="size-4" />
            Unresolved Campaign Update Proposals
          </div>
          <p className="mt-3 text-sm text-muted">
            No unresolved proposals yet.
          </p>
        </section> */
      }
    </div>
  );
}

function OverviewCard({
  icon,
  title,
  description,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>{icon}</CardAction>
      </CardHeader>
    </Card>
  );
}
