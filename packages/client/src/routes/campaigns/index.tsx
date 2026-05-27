import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/unstable/reactivity";
import { Loader2Icon, PlusIcon } from "lucide-react";
import * as React from "react";
import { Button, Form, Input } from "react-aria-components";
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
      .finally(() => setIsCreating(false));
  };

  return (
    <main className="min-h-full bg-surface text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            Tiny Taverns
          </p>
          <h1 className="text-3xl font-semibold">Choose a Campaign</h1>
          <p className="max-w-2xl text-muted">
            Start inside the right tabletop game so Conversations and campaign
            knowledge stay scoped.
          </p>
        </header>

        <Form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-elevated p-4 sm:flex-row"
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Campaign title"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-primary"
          />
          <Button
            type="submit"
            isDisabled={title.trim() === "" || isCreating}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlusIcon className="size-4" />
            )}
            Create Campaign
          </Button>
        </Form>

        {AsyncResult.isInitial(campaigns) || campaigns.waiting ? (
          <div className="flex justify-center py-8">
            <Loader2Icon className="size-6 animate-spin text-muted" />
          </div>
        ) : AsyncResult.isFailure(campaigns) ? (
          <p className="text-danger">Failed to load Campaigns</p>
        ) : campaigns.value.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
            Create your first Campaign to begin.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {campaigns.value.items.map((campaign) => (
              <Link
                key={campaign.id}
                to="/campaigns/$campaignId"
                params={{ campaignId: campaign.id }}
                className="rounded-2xl border border-border bg-elevated p-5 transition-colors hover:border-border-hover"
              >
                <h2 className="font-medium">{campaign.title}</h2>
                <p className="mt-2 text-sm text-muted">
                  Open Campaign overview
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
