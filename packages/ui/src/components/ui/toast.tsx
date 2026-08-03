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
 * One at a time, bottom-right; slides 10px in from the right and fades. The
 * variant travels as Base UI's `type` field, so `toast.add({ type: "success" })`
 * is what picks the strip colour and glyph.
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

function ToastProvider({ limit = 1, ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider limit={limit} {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "pointer-events-none fixed right-gutter bottom-gutter z-50",
        "flex flex-col-reverse items-end gap-3 outline-none",
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
        "pointer-events-auto flex w-85 max-w-full items-stretch overflow-hidden",
        "rounded-md border border-strong bg-surface-raised text-on-dark shadow-3 outline-none",
        "transition-[opacity,transform] duration-(--dur-base) ease-out",
        "data-starting-style:translate-x-2.5 data-starting-style:opacity-0",
        "data-ending-style:translate-x-2.5 data-ending-style:opacity-0",
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
        <ToastStrip variant={variant} />
        <ToastContent>
          <ToastTitle />
          {item.description ? <ToastDescription /> : null}
          {item.actionProps ? <ToastAction /> : null}
        </ToastContent>
        <ToastClose />
      </Toast>
    );
  });
}

/** Mount once, near the root. Defaults to one toast at a time, bottom-right. */
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
