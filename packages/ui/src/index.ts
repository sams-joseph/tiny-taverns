/**
 * The Tiny Taverns component layer: real shadcn/ui components on Base UI
 * primitives, styled from the design-system tokens.
 *
 * This module is the package's whole public surface — import from `@taverns/ui`,
 * never from `@taverns/ui/src/...`. See `packages/design-system/readme.md` for the
 * design rules each component implements.
 */

export { cn } from "./lib/utils";

export { Badge, badgeVariants } from "./components/ui/badge";
export { Button, buttonVariants } from "./components/ui/button";
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
export { Icon, icons } from "./components/ui/icon";
export type { IconName, IconProps } from "./components/ui/icon";
export { Label } from "./components/ui/label";
export { Toggle, toggleVariants } from "./components/ui/toggle";

export { Checkbox } from "./components/ui/checkbox";
export { Input } from "./components/ui/input";
export type { InputProps } from "./components/ui/input";
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
export { Switch } from "./components/ui/switch";

export {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  tabsTriggerVariants,
} from "./components/ui/tabs";

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
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
} from "./components/ui/toast";
export type { ToastVariant } from "./components/ui/toast";
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
export type { TooltipContentProps } from "./components/ui/tooltip";
