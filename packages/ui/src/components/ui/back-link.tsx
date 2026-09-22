import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";

import { cn } from "../../lib/utils";
import { Icon } from "./icon";

/**
 * The one way back: a chevron and the name of where it goes.
 *
 * The app had three — a secondary button, a ghost button and the campaign
 * row's bare chevron — for the same act, so a reader learned the idiom three
 * times. It is a link, not a button: it goes somewhere, and it is quieter than
 * any verb in the bar because it is not one.
 *
 * `render` takes the router's link element (`render={<Link to="/characters" />}`);
 * this package knows nothing about routes. The label is the destination —
 * *Characters*, *All NPCs*, *Overview* — never "Back", which says nothing about
 * where. A caller whose label is something richer than text (the campaign row's
 * name) passes it as `children` and styles it; the chevron is always this
 * component's.
 */
function BackLink({ className, render, children, ...props }: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "inline-flex min-w-4 shrink-0 items-center gap-1.5 rounded-control",
          "text-label-s leading-none font-medium whitespace-nowrap text-muted-foreground",
          "no-underline transition-control outline-none hover:text-foreground",
          "focus-visible:ring-focus",
          className,
        ),
        children: (
          <>
            <Icon name="chevron-left" size={14} className="shrink-0" />
            {children}
          </>
        ),
      },
      props,
    ),
    render,
    state: { slot: "back-link" },
  });
}

export { BackLink };
