import * as React from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { useIsMobile } from "../../hooks/use-mobile";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Icon } from "./icon";
import { Input } from "./input";
import { Separator } from "./separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet";
import type { SheetContainer } from "./sheet";
import { Skeleton } from "./skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * shadcn's sidebar: a fixed-width column beside the content that collapses out
 * of the way, and becomes a `Sheet` over the content when there is no room for
 * both.
 *
 * Eight things here are not upstream's, and each is a decision rather than a
 * tidy-up. They are collected in one place so a future `sidebar.json` from the
 * registry can be diffed against this file and the differences read off.
 *
 * 1. **It sizes to its container, not to the window.** Upstream's desktop
 *    container is `fixed inset-y-0 h-svh` and its mobile sheet portals to
 *    `<body>` — both correct for the one sidebar a page has, and both wrong for
 *    a panel that overlays *part* of an app. Here the container is `absolute`
 *    and `h-full`, so it fills whichever positioned ancestor it is rendered
 *    into, and `container` hands the same element to the sheet (see `sheet.tsx`,
 *    where that one prop switches the portal *and* the geometry together). The
 *    Hob panel uses this to cover the content column while the app's own top bar
 *    stays reachable above it, which is what `ui_kits/dm-screen/AppShell.jsx`
 *    draws.
 *
 * 2. **`z-chrome`, never a number.** Upstream writes `z-10` on the container and
 *    `z-20` on the rail. This product chooses layers from the scale in
 *    `styles.css` §3 and `layering.test.ts` fails on a literal. An expanded
 *    sidebar *is* the same kind of thing as the app's sticky header — page
 *    furniture that must lose to any scrim — so it takes the same rung. The
 *    overlaid form is a different question and is answered by `Sheet`, on
 *    `z-scrim` and `z-dialog`.
 *
 * 3. **The breakpoint is a parameter, and may be supplied outright.**
 *    `mobileBreakpoint` reaches `useIsMobile`; `isMobile` overrides the
 *    measurement entirely, the same way `open` overrides the open state. A shell
 *    that already knows which side of the threshold it is on — because it owns
 *    the shortcut and the layout — should not have the provider measure it a
 *    second time and risk the two disagreeing. It is also what lets a test name
 *    the side it is testing, since jsdom's `matchMedia` matches nothing.
 *
 * 4. **No cookie.** Upstream writes `sidebar_state` on every toggle so a server
 *    render can restore it. Nothing here is server-rendered and nothing reads it
 *    back, so it was a side effect with no reader.
 *
 * 5. **The keyboard shortcut is opt-out.** `⌘B` is upstream's; a host that owns
 *    its own opener passes `keyboardShortcut={null}` rather than ending up with
 *    two listeners toggling the same state on one keystroke — which cancels out
 *    and looks like a dead shortcut.
 *
 * 6. **One open state when it is controlled.** Upstream keeps a second,
 *    always-uncontrolled state for the overlaid form. See the comment on it.
 *
 * 7. **The overlaid form is non-modal, and dismisses only on its own scrim.**
 *    Base UI would close a dialog on any outside press, which races the opener
 *    that lives outside it: the press closes the sheet and the trigger's own
 *    click reopens it, so the button appears dead. `disablePointerDismissal`
 *    plus an explicit `onClick` on the backdrop makes it deterministic, and
 *    Escape is untouched. `modal={false}` is the other half: this sheet covers
 *    the *content*, so the chrome above it must stay clickable rather than be
 *    made inert, and the page has no scroll to lock. A host that wants the panel
 *    to trap focus can say `modal="trap-focus"` through `Sidebar`'s props.
 *
 * 8. **`className` reaches both forms.** Upstream drops it on the overlaid one.
 *    See the comment where it is applied.
 *
 * One smaller thing: a collapsed sidebar stays mounted and slides out of view,
 * so it is marked `inert` while it is off-canvas. Without that, everything in it
 * is still in the tab order and a keyboard user walks into a panel they cannot
 * see. The overlaid form has no such problem — the sheet unmounts.
 */

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

interface SidebarContextProps {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  container?: SheetContainer;
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  isMobile: isMobileProp,
  mobileBreakpoint,
  keyboardShortcut = SIDEBAR_KEYBOARD_SHORTCUT,
  container,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Skip the measurement and be told. See note 3. */
  isMobile?: boolean;
  /** Below this width the sidebar is an overlay. Defaults to shadcn's 768. */
  mobileBreakpoint?: number;
  /** The `⌘`/`Ctrl` chord that toggles it, or `null` for none. */
  keyboardShortcut?: string | null;
  /** Render the overlaid form into this element, and measure against it. */
  container?: SheetContainer;
}) {
  const measured = useIsMobile(mobileBreakpoint);
  const isMobile = isMobileProp ?? measured;

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
    },
    [setOpenProp, open],
  );

  // Upstream keeps a second, always-uncontrolled state for the overlaid form, so
  // that a sidebar collapsed on a wide screen does not come back as an open
  // drawer on a narrow one. That split only makes sense while the sidebar owns
  // its own state: a *controlled* one has exactly one owner and one truth, and
  // giving it a second would mean a host that set `open` watched nothing happen
  // below the breakpoint. So when `open` is supplied, it is the whole answer.
  const [_openMobile, _setOpenMobile] = React.useState(false);
  const controlled = openProp !== undefined;
  const openMobile = controlled ? open : _openMobile;
  const setOpenMobile = controlled ? setOpen : _setOpenMobile;

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((current) => !current) : setOpen((current) => !current);
  }, [isMobile, setOpen, setOpenMobile]);

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    if (keyboardShortcut === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === keyboardShortcut && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [keyboardShortcut, toggleSidebar]);

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed";

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      container,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar, container],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, state, openMobile, setOpenMobile, container } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-surface-card text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet
        open={openMobile}
        onOpenChange={setOpenMobile}
        // Non-modal, and dismissed only where we say. See note 7.
        modal={false}
        disablePointerDismissal
        {...props}
      >
        <SheetContent
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          container={container}
          overlayProps={{
            onClick: () => {
              setOpenMobile(false);
            },
          }}
          // `className` reaches both forms. Upstream drops it here, which leaves
          // a caller who sized or coloured the sidebar with it looking at an
          // unstyled drawer below the breakpoint — and a width set on the
          // provider cannot help, because the sheet is portalled out of its
          // subtree and the custom property does not inherit to it.
          className={cn(
            "w-(--sidebar-width) bg-surface-card p-0 text-foreground [&>button]:hidden",
            className,
          )}
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer text-foreground"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-(--dur-base) ease-out",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)",
        )}
      />
      <div
        data-slot="sidebar-container"
        data-side={side}
        // Off-canvas is still mounted, so it is still tabbable without this.
        inert={state === "collapsed" && collapsible === "offcanvas"}
        className={cn(
          "absolute inset-y-0 z-chrome flex h-full w-(--sidebar-width) transition-[left,right,width] duration-(--dur-base) ease-out",
          "data-[side=left]:left-0 data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]",
          "data-[side=right]:right-0 data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? // The trailing half-step is the pair of hairlines a framed variant adds.
              "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+(--spacing(0.5)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l border-hairline",
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex size-full flex-col bg-surface-card group-data-[variant=floating]:rounded-panel group-data-[variant=floating]:shadow-1 group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-hairline"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-8", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <Icon name="panel-left" size={14} />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-chrome hidden w-4 transition-all ease-out group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-px hover:after:bg-hairline sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-surface-card",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className,
      )}
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col bg-surface-page md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-panel md:peer-data-[variant=inset]:shadow-1 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className,
      )}
      {...props}
    />
  );
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("h-8 w-full bg-surface-page shadow-none", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  );
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("mx-2 w-auto bg-hairline", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "no-scrollbar flex min-h-0 flex-1 flex-col gap-0 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div"> & React.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex h-8 shrink-0 items-center rounded-control px-2 text-label-s font-medium text-faint ring-ring outline-hidden transition-[margin,opacity] duration-(--dur-base) ease-out group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
    },
  });
}

function SidebarGroupAction({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button"> & React.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-control p-0 text-foreground ring-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden after:absolute after:-inset-2 hover:bg-surface-raised hover:text-heading focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-group-action",
      sidebar: "group-action",
    },
  });
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-body-s", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-0", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button group/menu-button flex w-full items-center gap-2 overflow-hidden rounded-control p-2 text-left text-body-s ring-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-surface-raised hover:text-heading focus-visible:ring-2 active:bg-surface-raised active:text-heading disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-open:hover:bg-surface-raised data-open:hover:text-heading data-active:bg-surface-raised data-active:font-medium data-active:text-heading [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "hover:bg-surface-raised hover:text-heading",
        outline:
          "bg-surface-page ring-1 ring-hairline hover:bg-surface-raised hover:text-heading hover:ring-surface-raised",
      },
      size: {
        default: "h-8 text-body-s",
        sm: "h-7 text-label-s",
        lg: "h-12 text-body-s group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof TooltipContent>;
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar();
  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
      },
      props,
    ),
    render: !tooltip ? render : <TooltipTrigger render={render} />,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  });

  if (!tooltip) {
    return comp;
  }

  const content = typeof tooltip === "string" ? { children: tooltip } : tooltip;

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...content}
      />
    </Tooltip>
  );
}

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean;
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-control p-0 text-foreground ring-ring outline-hidden transition-transform group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-heading peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 after:absolute after:-inset-2 hover:bg-surface-raised hover:text-heading focus-visible:ring-2 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-active/menu-button:text-heading aria-expanded:opacity-100 md:opacity-0",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  });
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-control px-1 text-label-s font-medium text-foreground tabular-nums select-none group-data-[collapsible=icon]:hidden peer-hover/menu-button:text-heading peer-data-[size=default]/menu-button:top-1.5 peer-data-[size=lg]/menu-button:top-2.5 peer-data-[size=sm]/menu-button:top-1 peer-data-active/menu-button:text-heading",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean;
}) {
  // Random width between 50 to 90%.
  const [width] = React.useState(() => `${String(Math.floor(Math.random() * 40) + 50)}%`);

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-control px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton className="size-4 rounded-control" data-sidebar="menu-skeleton-icon" />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-hairline px-2.5 py-0.5 group-data-[collapsible=icon]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  );
}

function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}: useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    size?: "sm" | "md";
    isActive?: boolean;
  }) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-control px-2 text-foreground ring-ring outline-hidden group-data-[collapsible=icon]:hidden hover:bg-surface-raised hover:text-heading focus-visible:ring-2 active:bg-surface-raised active:text-heading disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-body-s data-[size=sm]:text-label-s data-active:bg-surface-raised data-active:text-heading [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-heading",
          className,
        ),
      },
      props,
    ),
    render,
    state: {
      slot: "sidebar-menu-sub-button",
      sidebar: "menu-sub-button",
      size,
      active: isActive,
    },
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  sidebarMenuButtonVariants,
  useSidebar,
};
