"use client";

import * as React from "react";
import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

/**
 * Dark hard-bordered message box with a filled glyph strip down the left —
 * deliberately shaped like an RPG dialogue box.
 *
 * Bottom-right; slides 10px in from the right and fades. Up to three stack, the
 * ones behind offset up and scaled back, fanning out to full size while the
 * pointer or focus is in the viewport. The geometry is `toast-stack` in
 * styles.css. The variant travels as Base UI's `type` field, so
 * `toast.add({ type: "success" })` is what picks the strip colour and glyph.
 */
const toast = ToastPrimitive.createToastManager();

export type ToastVariant = "default" | "destructive" | "success" | "magic";

const TOAST_GLYPH: Record<ToastVariant, IconName> = {
  default: "info",
  destructive: "triangle-alert",
  success: "check",
  magic: "sparkles",
};

const toastStripVariants = cva("flex w-9 shrink-0 items-center justify-center text-on-solid", {
  variants: {
    variant: {
      default: "bg-accent",
      destructive: "bg-danger",
      success: "bg-success",
      magic: "bg-magic",
    },
  },
  defaultVariants: { variant: "default" },
});

function asVariant(type: string | undefined): ToastVariant {
  return type && type in TOAST_GLYPH ? (type as ToastVariant) : "default";
}

/**
 * Three at once. Enough that a burst of rolls does not silently swallow the
 * first two, and few enough that the stack still reads as a stack: at one
 * scale step per position the third card is already at 80%, and a fourth would
 * be both tiny and almost entirely hidden behind the ones in front of it.
 */
const TOAST_LIMIT = 3;

function ToastProvider({ limit = TOAST_LIMIT, ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider limit={limit} {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

/**
 * The stack's positioning context. Every toast inside is absolutely positioned
 * against it, so it is a zero-height anchor at the bottom-right corner rather
 * than a column — `toast-stack` does the layout.
 */
function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "pointer-events-none fixed right-gutter bottom-gutter z-50 outline-none",
        "w-85 max-w-[calc(100vw_-_var(--gutter)_*_2)]",
        className,
      )}
      {...props}
    />
  );
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "toast-stack transition-toast pointer-events-auto",
        "rounded-md border border-strong bg-surface-raised text-on-dark shadow-3 outline-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The row inside the box. Base UI marks it `data-behind` on every toast that is
 * not frontmost, which is what lets a collapsed stack read as blank layered
 * cards instead of four sets of overlapping words.
 */
function ToastBody({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-body"
      className={cn(
        /* The clip lives here, not on the root: it keeps the strip's square
           corners inside the rounded border, and leaving the root unclipped is
           what lets `toast-stack`'s ::after reach out across the gap. */
        "flex h-full items-stretch overflow-hidden rounded-md",
        "transition-opacity duration-(--dur-base) ease-out",
        "data-behind:opacity-0 data-expanded:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function ToastStrip({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof toastStripVariants>) {
  return (
    <div
      data-slot="toast-strip"
      aria-hidden="true"
      className={cn(toastStripVariants({ variant }), className)}
      {...props}
    >
      <Icon name={TOAST_GLYPH[variant ?? "default"]} size={16} />
    </div>
  );
}

function ToastContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toast-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5", className)}
      {...props}
    />
  );
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("font-sans text-label leading-snug font-semibold", className)}
      {...props}
    />
  );
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("font-sans text-caption leading-body text-on-dark-muted", className)}
      {...props}
    />
  );
}

function ToastAction({
  className,
  render = <Button variant="secondary" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("mt-1.5 self-start", className)}
      {...props}
    />
  );
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="Dismiss"
      render={render}
      className={cn("m-1.5 size-7 shrink-0 self-start text-on-dark-muted", className)}
      {...props}
    >
      {children ?? <Icon name="x" size={12} />}
    </ToastPrimitive.Close>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((item) => {
    const variant = asVariant(item.type);
    return (
      <Toast key={item.id} toast={item}>
        <ToastBody>
          <ToastStrip variant={variant} />
          <ToastContent>
            <ToastTitle />
            {item.description ? <ToastDescription /> : null}
            {item.actionProps ? <ToastAction /> : null}
          </ToastContent>
          <ToastClose />
        </ToastBody>
      </Toast>
    );
  });
}

/** Mount once, near the root. Defaults to a stack of three, bottom-right. */
function Toaster({ children, toastManager = toast, ...props }: ToastPrimitive.Provider.Props) {
  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

const createToastManager = ToastPrimitive.createToastManager;
const useToastManager = ToastPrimitive.useToastManager;

export {
  Toast,
  ToastAction,
  ToastBody,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastStrip,
  ToastTitle,
  ToastViewport,
  Toaster,
  createToastManager,
  toast,
  useToastManager,
};
