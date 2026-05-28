import { CampaignId } from "@app/domain/api/campaign-rpc";
import { useAtomValue } from "@effect/atom-react";
import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  BookOpenIcon,
  Loader2Icon,
  MessageSquareIcon,
  ScrollTextIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";
import { campaignDataFamily } from "../-lib/campaign-atoms.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";

export const Route = createFileRoute("/campaigns/$campaignId/")({
  component: CampaignLayout,
});

function CampaignLayout() {
  return <Outlet />;
}

export function CampaignOverviewPage() {
  const navigate = useNavigate();
  const { campaignId } = Route.useParams();
  const campaign = useAtomValue(
    campaignDataFamily(CampaignId.make(campaignId)),
  );

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
    <main className="min-h-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Button
            onClick={() =>
              navigate({
                to: "/campaigns/$campaignId/conversations/$chatId",
                params: {
                  campaignId: campaign.value.id,
                  chatId: campaign.value.defaultChatId,
                },
              })
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          >
            <MessageSquareIcon className="size-4" />
            Open General Conversation
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OverviewCard
            icon={<MessageSquareIcon className="size-5" />}
            title="Conversations"
            description="Prep, play, recap, and worldbuilding threads."
          />
          <OverviewCard
            icon={<UsersIcon className="size-5" />}
            title="NPCs"
            description="Campaign-scoped cast members."
          />
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
        {/* <section className="rounded-2xl border border-border bg-elevated p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <ScrollTextIcon className="size-4" />
            Unresolved Campaign Update Proposals
          </div>
          <p className="mt-3 text-sm text-muted">
            No unresolved proposals yet.
          </p>
        </section> */}
      </div>
    </main>
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
