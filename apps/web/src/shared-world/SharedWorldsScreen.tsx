import type { SharedWorldMembership } from "@taverns/api";
import { Link } from "@tanstack/react-router";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Icon, Input } from "@taverns/ui";
import { Result } from "effect";
import { useCallback, useState } from "react";
import { useApiAtom, useInvalidate } from "../api/atoms";
import { runApiResult } from "../api/client";
import { reads } from "../api/keys";
import { useCredential } from "../auth/credential";
import { ArchivedDialog } from "../campaign/ArchivedDialog";
import { Hob, useHobPanel } from "../hob";
import { AppShell, TopBar } from "../shell/AppShell";
import { EmptyState, FailureNotice, Loading } from "../ui/states";
import { ArchivedSharedWorldsDialog } from "./ArchivedSharedWorldsDialog";
import { sharedWorldsAtom } from "./load";

/**
 * Every explicit Shared World this account belongs to. Campaigns remain home;
 * this is the optional cross-campaign context directory.
 *
 * Founding one makes you its owner and first member in one transaction
 * (`sharedWorlds.create`), and campaigns can then be started inside it.
 *
 * There is no mode and no filter: an account's Shared Worlds are the explicit
 * contexts it belongs to, independently of its relation to any campaign.
 */

function SharedWorldRow({ membership }: { readonly membership: SharedWorldMembership }) {
  const sharedWorld = membership.sharedWorld;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start gap-2.5">
          <CardTitle className="flex-1">
            <Link
              to="/worlds/$worldId"
              params={{ worldId: sharedWorld.id }}
              className="text-heading no-underline hover:text-link-hover"
            >
              {sharedWorld.name}
            </Link>
          </CardTitle>
          {membership.isOwner && <Badge variant="secondary">Yours</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-link"
            nativeButton={false}
            render={<Link to="/worlds/$worldId" params={{ worldId: sharedWorld.id }} />}
          >
            Open
            <Icon name="chevron-right" size={15} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Names a new Shared World. Everything else about it has a column default. */
function NewSharedWorld() {
  const fetchCredential = useCredential();
  const invalidate = useInvalidate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const create = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    const token = await fetchCredential();
    const result = await runApiResult(
      (client) => client.sharedWorlds.create({ payload: { name: name.trim() } }),
      token,
    );

    setBusy(false);
    if (Result.isFailure(result)) {
      setError(
        result.failure.kind === "unauthorized"
          ? "That credential is not good for this."
          : "That did not save. Try it again.",
      );
      return;
    }
    setName("");
    invalidate([reads.mySharedWorlds]);
  }, [fetchCredential, invalidate, name]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Shared World name"
          placeholder="The Salt Company"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-xs"
        />
        <Button onClick={() => void create()} disabled={busy || name.trim() === ""}>
          {busy ? "Working…" : "Create Shared World"}
        </Button>
      </div>
      {error !== undefined && (
        <p role="alert" className="text-body-s leading-body text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function SharedWorldsScreen() {
  const [resource, retry] = useApiAtom(sharedWorldsAtom);
  const [worldShelfOpen, setWorldShelfOpen] = useState(false);
  const [campaignShelfOpen, setCampaignShelfOpen] = useState(false);
  const hob = useHobPanel({ initialOpen: false });

  const memberships = resource.state === "ready" ? resource.value : undefined;

  return (
    <AppShell
      onAskHob={hob.toggle}
      panel={<Hob hob={hob} />}
      topBar={
        <TopBar
          title="Shared Worlds"
          subtitle="Connected campaigns with one history and a shared memory for Hob."
        />
      }
    >
      <div className="flex flex-col gap-6">
        {resource.state === "loading" && <Loading label="Looking for your Shared Worlds…" />}
        {resource.state === "failed" && (
          <FailureNotice failure={resource.failure} onRetry={retry} />
        )}
        {memberships !== undefined && (
          <>
            <NewSharedWorld />
            {memberships.length === 0 ? (
              <EmptyState icon="map" title="No Shared World yet">
                Create one when two campaigns should share history and Hob's memory.
              </EmptyState>
            ) : (
              <div className="grid gap-4 @3xl:grid-cols-2">
                {memberships.map((membership) => (
                  <SharedWorldRow key={membership.sharedWorld.id} membership={membership} />
                ))}
              </div>
            )}
            {/* The way back for shelved tables, and deliberately the quietest
                thing on the page. It requests nothing until it is opened. */}
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setWorldShelfOpen(true)}
              >
                <Icon name="history" size={14} />
                Archived Shared Worlds
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setCampaignShelfOpen(true)}
              >
                <Icon name="history" size={14} />
                Archived campaigns
              </Button>
            </div>
          </>
        )}
      </div>

      {worldShelfOpen && <ArchivedSharedWorldsDialog onClose={() => setWorldShelfOpen(false)} />}
      {campaignShelfOpen && <ArchivedDialog onClose={() => setCampaignShelfOpen(false)} />}
    </AppShell>
  );
}
