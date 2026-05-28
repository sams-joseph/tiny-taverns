"use client";

import { ChevronDown, LoaderIcon, Plus, Settings, Sword } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { Link } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { campaignListAtom } from "@/routes/campaigns/-lib/campaign-atoms";
import { AsyncResult } from "effect/unstable/reactivity";
import { npcListAtom } from "@/routes/npcs/-lib/npcs-atoms";

export function AppSidebar() {
  const campaigns = useAtomValue(campaignListAtom);
  const npcs = useAtomValue(npcListAtom);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <Link to="/">
                  <div className="flex size-8 items-center aspect-square justify-center rounded-lg bg-primary text-primary-foreground">
                    <Sword className="size-4" />
                  </div>
                  <div className="grid gap-0.5 leading-none">
                    <span className="font-semibold truncate">DM Sidekick</span>
                    <span className="text-xs truncate text-muted-foreground">
                      Your adventure awaits
                    </span>
                  </div>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Campaigns Section */}

        <Collapsible defaultOpen className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel
              className="mr-[1.8rem]"
              render={
                <CollapsibleTrigger>
                  Campaigns
                  <ChevronDown className="ml-auto size-4 transition-transform group-data-open/collapsible:rotate-180" />
                </CollapsibleTrigger>
              }
            />
            <SidebarGroupAction>
              <Plus /> <span className="sr-only">Add Campaign</span>
            </SidebarGroupAction>
            <CollapsibleContent>
              <SidebarGroupContent>
                {AsyncResult.isInitial(campaigns) || campaigns.waiting ? (
                  <div className="flex justify-center py-8">
                    <LoaderIcon className="size-6 animate-spin text-muted" />
                  </div>
                ) : AsyncResult.isFailure(campaigns) ? (
                  <p className="text-danger">Failed to load Campaigns</p>
                ) : campaigns.value.items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
                    Create your first Campaign to begin.
                  </div>
                ) : (
                  <SidebarMenu>
                    {campaigns.value.items.map((campaign) => (
                      <SidebarMenuItem key={campaign.id}>
                        <SidebarMenuButton
                          render={
                            <Link
                              to={`/campaigns/$campaignId`}
                              params={{ campaignId: campaign.id }}
                            >
                              <span>{campaign.title}</span>
                            </Link>
                          }
                          // isActive={pathname === `/campaigns/${campaign.id}`}
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <Collapsible defaultOpen className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel
              className="mr-[1.8rem]"
              render={
                <CollapsibleTrigger>
                  NPCs
                  <ChevronDown className="ml-auto size-4 transition-transform group-data-open/collapsible:rotate-180" />
                </CollapsibleTrigger>
              }
            />
            <SidebarGroupAction>
              <Plus /> <span className="sr-only">Add NPC</span>
            </SidebarGroupAction>
            <CollapsibleContent>
              <SidebarGroupContent>
                {AsyncResult.isInitial(npcs) || npcs.waiting ? (
                  <div className="flex justify-center py-8">
                    <LoaderIcon className="size-6 animate-spin text-muted" />
                  </div>
                ) : AsyncResult.isFailure(npcs) ? (
                  <p className="text-danger">Failed to load NPCs</p>
                ) : npcs.value.items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted">
                    Create your first NPC to begin.
                  </div>
                ) : (
                  <SidebarMenu>
                    {npcs.value.items.map((npc) => (
                      <SidebarMenuItem key={npc.id}>
                        <SidebarMenuButton
                          render={
                            <Link
                              to={`/npcs/$npcId`}
                              params={{ npcId: npc.id }}
                            >
                              <span>{npc.title}</span>
                            </Link>
                          }
                          // isActive={pathname === `/npcs/${npc.id}`}
                        />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link to="/">
                  <Settings className="size-4" />
                  <span>Settings</span>
                </Link>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
