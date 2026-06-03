import { Button } from "@/components/ui/button.js";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import { Form } from "@base-ui/react";
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/unstable/reactivity";
import { Loader2Icon, PlusIcon } from "lucide-react";
import * as React from "react";
import { campaignListAtom, createCampaignAtom } from "./-lib/campaign-atoms.js";

export const Route = createFileRoute("/campaigns/")({
  component: CampaignListPage,
});

function CampaignListPage() {
  const campaigns = useAtomValue(campaignListAtom);
  const createCampaign = useAtomSet(createCampaignAtom, { mode: "promise" });
  const refreshCampaigns = useAtomRefresh(campaignListAtom);
  const navigate = useNavigate();
  const [title, setTitle] = React.useState("");
  const [isCreating, setIsCreating] = React.useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "" || isCreating) {
      return;
    }
    setIsCreating(true);
    void createCampaign({ title: trimmed })
      .then((campaign) => {
        setTitle("");
        refreshCampaigns();
        void navigate({
          to: "/campaigns/$campaignId",
          params: { campaignId: campaign.id },
        });
      })
      .finally(() =>{  setIsCreating(false); });
  };

  return (
    <div className="flex w-full flex-col gap-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Choose a Campaign</h1>
        <p className="max-w-2xl text-foreground">
          Start inside the right tabletop game so Conversations and campaign knowledge stay scoped.
        </p>
      </header>

      <Form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-elevated p-4 sm:flex-row"
      >
        <Input
          value={title}
          onChange={(event) =>{  setTitle(event.target.value); }}
          placeholder="Campaign title"
          className="flex-1"
        />
        <Button
          type="submit"
          size="lg"
          disabled={title.trim() === "" || isCreating}
        >
          {isCreating
            ? <Loader2Icon className="size-4 animate-spin" />
            : <PlusIcon className="size-4" />}
          Create Campaign
        </Button>
      </Form>

      {AsyncResult.isInitial(campaigns) || campaigns.waiting
        ? (
          <div className="flex justify-center py-8">
            <Loader2Icon className="size-6 animate-spin text-foreground" />
          </div>
        )
        : AsyncResult.isFailure(campaigns)
        ? <p className="text-danger">Failed to load Campaigns</p>
        : campaigns.value.items.length === 0
        ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-foreground">
            Create your first Campaign to begin.
          </div>
        )
        : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {campaigns.value.items.map((campaign) => (
              <Link
                key={campaign.id}
                to="/campaigns/$campaignId"
                params={{ campaignId: campaign.id }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle>{campaign.title}</CardTitle>
                    <CardDescription>Open Campaign overview</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}
