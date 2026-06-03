"use client";

import { Link } from "@tanstack/react-router";
import * as React from "react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

export function AppNav() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink
            className={navigationMenuTriggerStyle()}
            render={<Link to="/">Home</Link>}
          />
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Campaigns</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="w-96">
              <ListItem to="/campaigns" title="All Campaigns">
                View all your campaigns and start new ones.
              </ListItem>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function ListItem({
  title,
  children,
  to,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & { to: string; }) {
  return (
    <li {...props}>
      <NavigationMenuLink
        render={
          <Link to={to}>
            <div className="flex flex-col gap-1 text-sm">
              <div className="leading-none font-medium">{title}</div>
              <div className="line-clamp-2 text-muted-foreground">
                {children}
              </div>
            </div>
          </Link>
        }
      />
    </li>
  );
}
