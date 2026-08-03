import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";

import { cn } from "../../lib/utils";

/**
 * An underline bar: the active trigger is semibold with a 2px accent rule;
 * inactive triggers are muted. Triggers are 13px medium sentence case.
 *
 * This is the only navigation pattern in the app — never a pill group or a
 * segmented control.
 */
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("group/tabs flex flex-col gap-4", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("flex items-end gap-0.5 border-b border-hairline", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px inline-flex h-9 shrink-0 items-center justify-center gap-1.5 px-3",
        "border-b-2 border-transparent bg-transparent",
        "font-sans text-label leading-none font-medium whitespace-nowrap text-muted-foreground",
        "cursor-pointer transition-control outline-none",
        "hover:text-foreground",
        "data-active:border-accent data-active:font-semibold data-active:text-heading",
        "focus-visible:ring-focus",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-body-s outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
